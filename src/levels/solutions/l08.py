# Round the lava by the bridge at the top.
route = [(350, 150), (475, 50), (650, 50), (750, 550), (1025, 150)]

leg = 0
hull = bot.health()

for x, y in route:
    leg = leg + 1
    bot.drive.turn(bot.gps.bearing_to(x, y))
    bot.drive.forward(bot.gps.distance_to(x, y))
    lost = hull - bot.health()
    hull = bot.health()
    print("Leg", leg, "done, lost", lost, "hull")
