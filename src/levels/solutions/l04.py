route = [(200, 125), (800, 125), (875, 575), (500, 350)]

for x, y in route:
    bot.drive.turn(bot.gps.bearing_to(x, y))
    bot.drive.forward(bot.gps.distance_to(x, y))
