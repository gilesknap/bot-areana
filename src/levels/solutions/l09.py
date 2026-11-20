def nearest_enemy():
    for thing in bot.radar.scan():
        if thing.kind == "bot":
            return thing
    return None


while True:
    enemy = nearest_enemy()
    energy = bot.battery.level()

    # Shield only when someone is close and we can afford it.
    if enemy is not None and enemy.distance < 450 and energy > 20:
        bot.shield.on()
    else:
        bot.shield.off()

    if enemy is not None:
        bot.drive.turn(enemy.bearing)
        if enemy.distance < 500 and energy > 10 and bot.blaster.ready():
            bot.blaster.fire()
    bot.wait(0.2)
