# Round the lava by the bridge at the top.
route = [(280, 120), (380, 40), (520, 40), (600, 440), (820, 120)]

leg = 0
hull = bot.health()

for x, y in route:
    leg = leg + 1
    bot.drive.turn(bot.gps.bearing_to(x, y))
    bot.drive.forward(bot.gps.distance_to(x, y))
    lost = hull - bot.health()
    hull = bot.health()
    print("Leg", leg, "done, lost", lost, "hull")
