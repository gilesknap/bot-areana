class Hunter:
    def __init__(self):
        # Places to look from when nothing is on radar, visited in turn.
        self.lookouts = [(550, 400), (250, 250), (850, 250)]
        self.next_lookout = 0
        self.shots = 0

    def nearest_enemy(self):
        for thing in bot.radar.scan():
            if thing.kind == "bot" or thing.kind == "turret":
                return thing
        return None

    def guard(self, target):
        # Shield up when something is close, as long as the battery allows.
        if target.distance < 500 and bot.battery.level() > 15:
            bot.shield.on()
        else:
            bot.shield.off()

    def attack(self, target):
        bot.drive.turn(target.bearing)
        if target.distance > 375:
            bot.drive.forward(min(125, target.distance - 325))
        elif bot.blaster.ready():
            bot.blaster.fire()
            self.shots += 1

    def explore(self):
        x, y = self.lookouts[self.next_lookout]
        self.next_lookout = (self.next_lookout + 1) % len(self.lookouts)
        bot.drive.turn(bot.gps.bearing_to(x, y))
        bot.drive.forward(bot.gps.distance_to(x, y))

    def hunt(self):
        while True:
            target = self.nearest_enemy()
            if target is None:
                bot.shield.off()
                self.explore()
            else:
                self.guard(target)
                self.attack(target)
                bot.wait(0.2)


Hunter().hunt()
