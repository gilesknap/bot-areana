"""Bot Arena's Python side of the bridge.

Run once per interpreter, in a private namespace (never the player's). It locks down imports and
defines `run_player`, which runtime.ts calls for every run. Talks to JavaScript only through the
`bridge(op, json)` function passed in per run, using JSON strings both ways.
"""

import builtins
import difflib
import io
import json
import random
import sys
import time
import traceback

# ---- sandbox ----------------------------------------------------------------------------------
# Modules that reach JavaScript, the network or the host (a name blocks its submodules too).
# Removed from the module cache and refused by an import hook, so `import js` fails even via
# another module's __builtins__. Python code can't be sealed off completely in Pyodide, so the
# worker (lockdown.ts) also removes every way out on the JavaScript side.
BLOCKED_MODULES = frozenset({
    'js', 'pyodide', 'pyodide_js', '_pyodide', '_pyodide_core', 'micropip',
    'socket', 'ssl', 'urllib.request', 'http', 'subprocess', 'webbrowser', 'ctypes',
})


def _is_blocked(name):
    parts = name.split('.')
    return any('.'.join(parts[:i]) in BLOCKED_MODULES for i in range(1, len(parts) + 1))


for _name in list(sys.modules):
    if _is_blocked(_name):
        del sys.modules[_name]

# Pyodide's own finder serves `js` from a registry, which would bypass a removed meta_path hook.
for _finder in sys.meta_path:
    for _name in ('js', 'pyodide_js'):
        getattr(_finder, 'jsproxies', {}).pop(_name, None)


def _blocked_error(name):
    return ModuleNotFoundError(f"No module named '{name}' (it is not available in Bot Arena)", name=name)


class _BlockedFinder:
    def find_spec(self, name, path=None, target=None):
        if _is_blocked(name):
            raise _blocked_error(name)
        return None


sys.meta_path.insert(0, _BlockedFinder())

_real_import = builtins.__import__


def _guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
    if _is_blocked(name):
        raise _blocked_error(name)
    return _real_import(name, globals, locals, fromlist, level)


def _no_input(prompt=''):
    raise RuntimeError("input() can't be used in Bot Arena - your bot can't stop to ask questions mid-match")


# ---- game exceptions ----------------------------------------------------------------------------
class BotError(Exception):
    """Base class for Bot Arena's own errors. `except BotError:` catches all of them."""


class BlasterNotReady(BotError):
    """The blaster is still cooling down. Check bot.blaster.ready() first."""


class OutOfEnergy(BotError):
    """Not enough energy in the battery for that."""


class PartNotFitted(BotError, AttributeError):
    """The bot doesn't have that part. Fit it in the Workshop. (An AttributeError too, so hasattr works.)"""


# Private references, so a script that replaces json.dumps can't break the bridge.
_dumps, _loads = json.dumps, json.loads

BOT_ERRORS = {'BlasterNotReady': BlasterNotReady, 'OutOfEnergy': OutOfEnergy, 'PartNotFitted': PartNotFitted}


class _MatchOver(BaseException):
    """The match ended (won, destroyed, time up). Not an Exception, so `except Exception` won't stop it."""


class _Watchdog(BaseException):
    """Raised by the headless watchdog when the script runs too long without calling the bot."""


class _InternalError(BaseException):
    """Something broke on the JavaScript side (not the player's fault)."""


# ---- values returned by the API --------------------------------------------------------------------
class ScanResult:
    """Something the radar saw: .kind, .bearing (degrees, + is right), .distance (cm), .x, .y"""

    __slots__ = ('kind', 'bearing', 'distance', 'x', 'y')

    def __init__(self, kind, bearing, distance, x, y):
        self.kind = kind
        self.bearing = bearing
        self.distance = distance
        self.x = x
        self.y = y

    def __repr__(self):
        return (f'ScanResult(kind={self.kind!r}, bearing={self.bearing}, distance={self.distance}, '
                f'x={self.x}, y={self.y})')


def _float(v):
    return float(v) if isinstance(v, int) and not isinstance(v, bool) else v


def _convert(value, returns):
    """Shape a JSON value as the spec's return type. JSON drops the '.0' of whole floats."""
    if value is None:
        return None
    if returns.startswith('tuple') and isinstance(value, list):
        return tuple(_float(v) for v in value)
    if returns == 'list[ScanResult]':
        return [ScanResult(d.get('kind'), _float(d.get('bearing')), _float(d.get('distance')),
                           _float(d.get('x')), _float(d.get('y')))
                for d in value]
    if returns.startswith('float'):
        return _float(value)
    return value


def _num(value, name, where):
    """Check a numeric argument, so mistakes get a clear message instead of a JavaScript error."""
    if isinstance(value, (int, float)):
        if value != value or value in (float('inf'), float('-inf')):
            raise ValueError(f'{where}() needs a normal number for {name}, not {value!r}')
        return value
    raise TypeError(f'{where}() needs a number for {name}, not {type(value).__name__} ({value!r})')


# ---- descriptions for missing parts ---------------------------------------------------------------
_UNIQUE_PARTS = {
    'drive': 'drive train', 'radar': 'radar', 'gps': 'Compass/GPS', 'blaster': 'blaster',
    'shield': 'shield generator', 'battery': 'battery', 'mines': 'mine dropper',
}
_SLOTS = ('front', 'rear', 'left', 'right', 'centre')


def _missing_part(name):
    """Describe a part the bot could have but doesn't, or None if `name` isn't a part name."""
    if name in _UNIQUE_PARTS:
        return _UNIQUE_PARTS[name]
    slot, _, kind = name.partition('_')
    if slot in _SLOTS and kind == 'sensor':
        return f'rangefinder in the {slot} slot'
    if slot in _SLOTS and kind == 'bumper':
        return f'bump sensor in the {slot} slot'
    return None


def _ours(exc):
    """Mark an exception whose message is already written for players (no Python suggestions)."""
    exc.bot_arena_message = True
    return exc


def _did_you_mean(name, options):
    close = difflib.get_close_matches(name, list(options), n=1)
    return f" Did you mean '{close[0]}'?" if close else ''


class _Part:
    """Base class for generated part classes (attributes of `bot`)."""

    _attr = ''
    _part = ''

    def __getattr__(self, name):
        methods = [n for n in dir(type(self)) if not n.startswith('_')]
        raise _ours(AttributeError(f"bot.{self._attr} has no '{name}'.{_did_you_mean(name, methods)}"))

    def __repr__(self):
        return f'<bot.{self._attr}: {self._part}>'


class _BotBase:
    """Base class for the generated Bot class."""

    _fitted = {}  # attr -> part id

    def __getattr__(self, name):
        if name.startswith('__'):
            raise AttributeError(name)
        missing = _missing_part(name)
        if missing:
            same_kind = [a for a in self._fitted if a.endswith(name.partition('_')[2]) and '_' in name]
            also = f" (you have: {', '.join('bot.' + a for a in same_kind)})" if same_kind else ''
            raise _ours(PartNotFitted(f'your bot has no {missing} fitted{also} - add one in the Workshop.'))
        options = list(self._fitted) + [n for n in dir(type(self)) if not n.startswith('_')]
        raise _ours(AttributeError(f"bot has no '{name}'.{_did_you_mean(name, options)}"))

    def __repr__(self):
        return f"<bot with {', '.join(self._fitted) or 'no parts'}>"


# ---- a run ---------------------------------------------------------------------------------------
class _Session:
    """One run: forwards calls to the sim via the bridge and tracks when time last passed."""

    def __init__(self, bridge):
        self.bridge = bridge
        self.over = False
        self.last_call = time.monotonic()

    def _send(self, op, payload):
        reply = _loads(self.bridge(op, _dumps(payload)))
        if 'internal' in reply:
            raise _InternalError(reply['internal'])
        return reply

    def call(self, attr, method, args, returns):
        if self.over:
            raise _MatchOver()
        # The lines run since the last call all start at this tick, before the call moves time on.
        reply = self._send('call', [attr, method, args, _take_lines()])
        if 'over' in reply:
            self.over = True
            _stop_player_code()
            raise _MatchOver()
        self.last_call = time.monotonic()
        if 'error' in reply:
            raise BOT_ERRORS[reply['error']](reply['message'])
        return _convert(reply.get('value'), returns)

    def write(self, text, stream):
        self._send('print', [text, stream])

    def log(self, values):
        self.write(' '.join(str(v) for v in values), 'log')



class _Console(io.TextIOBase):
    """sys.stdout / sys.stderr during a run: sends each complete line to the game console."""

    def __init__(self, session, stream):
        self._session = session
        self._stream = stream
        self._pending = ''

    def writable(self):
        return True

    def write(self, text):
        *lines, self._pending = (self._pending + str(text)).split('\n')
        for line in lines:
            self._session.write(line, self._stream)
        return len(text)

    def close_line(self):
        if self._pending:
            self._session.write(self._pending, self._stream)
            self._pending = ''


def _stop_player_code():
    """The match is over: make every further line of main.py raise _MatchOver, so a bare
    `except:` that swallowed the first one can't keep the script spinning."""
    def local(frame, event, arg):
        if event == 'line':
            raise _MatchOver()
        return local

    sys.settrace(lambda frame, event, arg: local if frame.f_code.co_filename == 'main.py' else None)
    frame = sys._getframe()
    while frame is not None:
        if frame.f_code.co_filename == 'main.py':
            frame.f_trace = local
            frame.f_trace_lines = True
        frame = frame.f_back


# ---- line records -------------------------------------------------------------------------------
# Every line of main.py as it starts, so playback can step through the script a line at a time.
# sys.monitoring on main.py's own code objects only: the rest of Python (the bridge, the sim
# calls) runs untraced. Between two bot calls (so within one tick: every call takes at least one)
# it keeps the first MAX_LINES_PER_CALL lines. Past the cap, the last slot takes each further line
# once as it turns that line's event off until the next call, so a long loop that never calls the
# bot runs at full speed; the last slot is then the call's line, or the error's (run_player).
MAX_LINES_PER_CALL = 100
_LINE_TOOL = sys.monitoring.DEBUGGER_ID
_lines = []
_muted = False


def _on_line(code, line):
    global _muted
    if len(_lines) < MAX_LINES_PER_CALL:
        _lines.append(line)
        return None
    _lines[-1] = line
    _muted = True
    return sys.monitoring.DISABLE


def _take_lines():
    global _muted
    if _muted:
        _muted = False
        sys.monitoring.restart_events()
    taken = _lines[:]
    _lines.clear()
    return taken


def _code_objects(code):
    yield code
    for const in code.co_consts:
        if isinstance(const, type(code)):
            yield from _code_objects(const)


def _record_lines(code, on):
    for c in _code_objects(code):
        sys.monitoring.set_local_events(_LINE_TOOL, c, sys.monitoring.events.LINE if on else 0)


sys.monitoring.use_tool_id(_LINE_TOOL, 'bot-arena lines')
sys.monitoring.register_callback(_LINE_TOOL, sys.monitoring.events.LINE, _on_line)


def _snapshot_modules():
    return {name: (mod, dict(mod.__dict__)) for name, mod in list(sys.modules.items())}, list(sys.meta_path)


def _restore_modules(saved):
    """Undo what a script did to shared modules (json.dumps = ..., new imports), so every run
    starts from the same interpreter state."""
    modules, meta_path = saved
    for name in list(sys.modules):
        if name not in modules:
            del sys.modules[name]
    for name, (mod, contents) in modules.items():
        sys.modules[name] = mod
        current = mod.__dict__
        for key in current.keys() - contents.keys():
            del current[key]
        for key, value in contents.items():
            if current.get(key) is not value:
                current[key] = value
    sys.meta_path[:] = meta_path


def _install_watchdog(session, seconds):
    """Headless only: raise _Watchdog if the player's code runs `seconds` without a bot call."""
    count = 0

    def local(frame, event, arg):
        nonlocal count
        count += 1
        if count % 2000 == 0 and not session.over and time.monotonic() - session.last_call > seconds:
            raise _Watchdog()
        return local

    def tracer(frame, event, arg):
        return local if frame.f_code.co_filename == 'main.py' else None

    sys.settrace(tracer)


def _error_line(exc):
    if isinstance(exc, SyntaxError) and exc.filename == 'main.py':
        return exc.lineno
    line = None
    for entry in traceback.extract_tb(exc.__traceback__):
        if entry.filename == 'main.py':
            line = entry.lineno
    return line


def _error_message(exc, renames):
    if isinstance(exc, SyntaxError):
        message = exc.msg
    elif isinstance(exc, BotError) or getattr(exc, 'bot_arena_message', False):
        message = str(exc)
    else:
        # format_exception_only adds Python's own "Did you mean ...?" suggestions.
        last = traceback.format_exception_only(exc)[-1].strip()
        prefix = type(exc).__name__ + ': '
        message = last[len(prefix):] if last.startswith(prefix) else str(exc)
    for old, new in renames:
        message = message.replace(old, new)
    return message


def run_player(bridge, bot_source, script, seed, watchdog_seconds):
    """Build `bot`, run the player's script as main.py, and report how it ended (JSON)."""
    session = _Session(bridge)
    gen = {
        '__name__': 'bot', '_Part': _Part, '_BotBase': _BotBase, '_num': _num,
        '_call': session.call, '_log': session.log,
    }
    exec(compile(bot_source, '<bot>', 'exec'), gen)
    bot = gen['Bot']()
    # "Drive.forward() missing 1 required argument" reads better as "bot.drive.forward() ...".
    renames = [(f'{cls.__name__}.', f'bot.{cls._attr}.') for cls in gen.values()
               if isinstance(cls, type) and issubclass(cls, _Part)] + [('Bot.', 'bot.')]

    player_builtins = dict(builtins.__dict__)
    player_builtins.update(input=_no_input, __import__=_guarded_import)
    namespace = {
        '__name__': '__main__', '__builtins__': player_builtins, 'bot': bot,
        'BotError': BotError, 'BlasterNotReady': BlasterNotReady,
        'OutOfEnergy': OutOfEnergy, 'PartNotFitted': PartNotFitted,
    }
    random.seed(seed)
    consoles = _Console(session, 'stdout'), _Console(session, 'stderr')
    sys.stdout, sys.stderr = consoles

    code = None
    _lines.clear()
    try:
        code = compile(script, 'main.py', 'exec')
        _record_lines(code, True)
        if watchdog_seconds:
            _install_watchdog(session, watchdog_seconds)
        exec(code, namespace)
        status = {'status': 'over' if session.over else 'ok'}
    except _MatchOver:
        status = {'status': 'over'}
    except SystemExit:
        status = {'status': 'over' if session.over else 'ok'}
    except _Watchdog as exc:
        status = {'status': 'over'} if session.over else {'status': 'watchdog', 'line': _error_line(exc)}
    except _InternalError as exc:
        status = {'status': 'internal', 'message': str(exc)}
    except BaseException as exc:
        status = {
            'status': 'error',
            'type': type(exc).__name__,
            'message': _error_message(exc, renames),
            'line': _error_line(exc),
            'game': isinstance(exc, BotError),
        }
    finally:
        sys.settrace(None)
        if code is not None:
            _record_lines(code, False)
        for console in consoles:
            console.close_line()
        _restore_modules(_PRISTINE)
    # Lines after the last bot call start at the final tick. Past the cap the last one may be stale,
    # so end on the line that raised.
    lines = _take_lines()
    if lines and status.get('line'):
        lines[-1] = status['line']
    status['lines'] = lines
    return _dumps(status)


_PRISTINE = _snapshot_modules()
