def find_enemy():
    for thing in bot.radar.scan():
        if thing.kind == "bot":
            return thing
    return None


while True:
    enemy = find_enemy()
    if enemy is None:
        bot.wait(0.5)
    else:
        bot.drive.turn(enemy.bearing)
        if enemy.distance > 300:
            bot.drive.forward(60)
        elif bot.blaster.ready():
            bot.blaster.fire()
        bot.wait(0.2)
