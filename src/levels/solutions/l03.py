# Go to the bottom of the left lane and look up it.
bot.drive.turn(-90)
bot.drive.forward(300)
bot.drive.turn(90)

if bot.front_sensor.distance() > 400:
    # Left lane is clear: up it, then right to the flag.
    bot.drive.forward(500)
    bot.drive.turn(90)
    bot.drive.forward(300)
else:
    # Blocked: cross to the right lane, up it, then left to the flag.
    bot.drive.turn(90)
    bot.drive.forward(600)
    bot.drive.turn(-90)
    bot.drive.forward(500)
    bot.drive.turn(-90)
    bot.drive.forward(300)
