def bumped():
    return bot.front_bumper.hit()


def drive_until_bump():
    bot.drive.forward(1000, wait=False)
    while not bumped():
        bot.wait(0.1)
    # Back off to the middle of the next corridor.
    bot.drive.backward(22)


while True:
    drive_until_bump()
    bot.drive.turn(90)
