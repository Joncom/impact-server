ig.module(
	'game.server.main'
)
.requires(
    'plugins.server',
    'game.levels.field',
    'game.server.entities.player',
    'game.server.entities.drone'
)
.defines(function() {

    MyGame = ig.Game.extend({
        timer: null,
        freq: 3,
        init: function() {
            this.loadLevel(LevelField);
            ig.game.spawnEntity(EntityDrone, 100, 100);
            ig.game.spawnEntity(EntityDrone, 200, 200);
            ig.game.spawnEntity(EntityDrone, 300, 300);
            ig.game.spawnEntity(EntityDrone, 400, 400);
            this.timer = new ig.Timer(1/this.freq);

            ig.io.sockets.on('connection', function(socket) {
                console.log("Client " + socket.id + " connected.");
            });
        },

        update: function() {
            this.parent();
            if(this.timer.delta() >= 0) {
                this.timer.reset();
                console.log("Tick");
            }
        }
    });

    ig.main('#canvas', MyGame, 60, 320, 240, 2);

});
