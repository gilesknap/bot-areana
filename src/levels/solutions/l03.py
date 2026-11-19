# Go to the bottom of the left lane and look up it.
bot.drive.turn(-90)
bot.drive.forward(240)
bot.drive.turn(90)

if bot.front_sensor.distance() > 300:
    # Left lane is clear: up it, then right to the flag.
    bot.drive.forward(380)
    bot.drive.turn(90)
    bot.drive.forward(240)
else:
    # Blocked: cross to the right lane, up it, then left to the flag.
    bot.drive.turn(90)
    bot.drive.forward(480)
    bot.drive.turn(-90)
    bot.drive.forward(380)
    bot.drive.turn(-90)
    bot.drive.forward(240)
