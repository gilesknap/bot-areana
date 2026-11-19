route = [(160, 100), (640, 100), (700, 460), (400, 280)]

for x, y in route:
    bot.drive.turn(bot.gps.bearing_to(x, y))
    bot.drive.forward(bot.gps.distance_to(x, y))
