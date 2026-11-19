"""Bot Arena's Python side of the bridge.

Run once per interpreter, in a private namespace (never the player's). It locks down imports and
defines `run_player`, which runtime.ts calls for every run. Talks to JavaScript only through the
`bridge(op, json)` function passed in per run, using JSON strings both ways.
"""

import builtins
import difflib
import json
import random
import sys
import time
import traceback

# ---- sandbox ----------------------------------------------------------------------------------
# Modules that reach JavaScript, the network or the host. Removed from the module cache and
# refused by an import hook, so `import js` fails even via another module's __builtins__.
BLOCKED_MODULES = frozenset({
    'js', 'pyodide', 'pyodide_js', '_pyodide', 'micropip',
    'socket', 'ssl', 'urllib', 'http', 'subprocess', 'webbrowser', 'ctypes',
})

for _name in list(sys.modules):
    if _name.partition('.')[0] in BLOCKED_MODULES:
        del sys.modules[_name]


def _blocked_error(name):
    return ModuleNotFoundError(f"No module named '{name}' (it is not available in Bot Arena)", name=name)


class _BlockedFinder:
    def find_spec(self, name, path=None, target=None):
        if name.partition('.')[0] in BLOCKED_MODULES:
            raise _blocked_error(name)
        return None


sys.meta_path.insert(0, _BlockedFinder())

_real_import = builtins.__import__


def _guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
    if name.partition('.')[0] in BLOCKED_MODULES:
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
        reply = json.loads(self.bridge(op, json.dumps(payload)))
        if 'internal' in reply:
            raise _InternalError(reply['internal'])
        return reply

    def call(self, attr, method, args, returns):
        if self.over:
            raise _MatchOver()
        reply = self._send('call', [attr, method, args])
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

    def make_print(self):
        def print(*values, sep=' ', end='\n', file=None, flush=False):
            if file is not None and file is not sys.stdout and file is not sys.stderr:
                return builtins.print(*values, sep=sep, end=end, file=file, flush=flush)
            text = (' ' if sep is None else sep).join(str(v) for v in values)
            self.write(text, 'stderr' if file is sys.stderr else 'stdout')
        return print


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
    player_builtins.update(print=session.make_print(), input=_no_input, __import__=_guarded_import)
    namespace = {
        '__name__': '__main__', '__builtins__': player_builtins, 'bot': bot,
        'BotError': BotError, 'BlasterNotReady': BlasterNotReady,
        'OutOfEnergy': OutOfEnergy, 'PartNotFitted': PartNotFitted,
    }
    random.seed(seed)

    try:
        code = compile(script, 'main.py', 'exec')
        if watchdog_seconds:
            _install_watchdog(session, watchdog_seconds)
        exec(code, namespace)
    except _MatchOver:
        return json.dumps({'status': 'over'})
    except SystemExit:
        pass
    except _Watchdog as exc:
        if session.over:
            return json.dumps({'status': 'over'})
        return json.dumps({'status': 'watchdog', 'line': _error_line(exc)})
    except _InternalError as exc:
        return json.dumps({'status': 'internal', 'message': str(exc)})
    except BaseException as exc:
        return json.dumps({
            'status': 'error',
            'type': type(exc).__name__,
            'message': _error_message(exc, renames),
            'line': _error_line(exc),
            'game': isinstance(exc, BotError),
        })
    finally:
        sys.settrace(None)
    return json.dumps({'status': 'over' if session.over else 'ok'})
