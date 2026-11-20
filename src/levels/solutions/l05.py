# The middle turret can reach the start pad, so it goes first.
turrets = [(550, 375), (200, 450), (325, 175), (775, 175), (900, 450)]

for x, y in turrets:
    bot.drive.turn(bot.gps.bearing_to(x, y))
    shots = 0
    while shots < 2:
        while not bot.blaster.ready():
            bot.wait(0.1)
        bot.blaster.fire()
        shots = shots + 1
