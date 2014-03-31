ig.module(
    'plugins.server'
)
.requires(
    'impact.game',
    'impact.entity',
    'impact.loader',
    'impact.input',
    'impact.system'
)
.defines(function() {
    Server = ig.Class.extend({
        clients: { },
        init: function() {
            var self = this;
            ig.io.sockets.on('connection', function(socket) {
                socket.on('disconnect', function() {
                    self.clientDisconnected(this);
                }).on('reconnect', function() {
                    self.clientReconnected(this);
                }).on('screen.move', function(obj) {
                   this.screen.x = obj.x;
                   this.screen.y = obj.y;
                }).on('input.event', function(obj) {
                    socket.input['set_' + obj.type](obj.action);
                }).on('input.mousemove', function(obj) {
                    this.input.mouse.x = obj.x;
                    this.input.mouse.y = obj.y;
                });
                self.clientConnected(socket);
            });
            // Every second calculate the average ping for clients.
            this.clientInterval = setInterval(function() {
                var total = i = 0;
                for (var key in self.clients) {
                    if (!self.clients[key]) continue;
                    total += self.clients[key].latency.avg;
                    i++;
                }
                self.clientAvgPing = parseInt(total / i);
            }, 1000);
        },
        emit: function(to, key, data) {
            if (!to || !to.emit) return;
            return to.emit(key, data);
        },
        broadcast: function(key, data) {
            for (var i in this.clients)
                this.emit(this.clients[i], key, data);
        },
        clientConnected: function(socket) {
            console.log('[INFO] Client connected: ' + socket.id);
            this.clients[socket.id] = socket;
            // Each client needs its own input class.
            socket.input = new ig.Input();
            socket.screen = { x: 0, y: 0 };
            ig.latency(socket);
            // Send the client all the active entities
            var self = this;
            ig.game.entities.forEach(function(ent) {
                self.entityCreate(ent.classType, ent.pos.x, ent.pos.y, ent._settings, socket);
            });
            this.broadcast('client.connect', { id: socket.id });
        },
        clientReconnected: function(socket) {
            console.log('[INFO] Client reconnected: ' + socket.id);
            this.broadcast('client.reconnect', { id: socket.id });
        },
        clientDisconnected: function(socket) {
            console.log('[INFO] Client disconnected: ' + socket.id);
            this.broadcast('client.disconnect', { id: socket.id });
            this.clients[socket.id] = undefined;
            // Remove all entities for the client that disconnected.
            // Count down so removing entities doesnt mess anything up.
            var cnt = ig.game.entities.length - 1;
            var removed = 0;
            for (var i = cnt; i >= 0; i--) {
                var ent = ig.game.entities[i];
                // Use removeEntity instead of kill.
                if (ent.owner == socket.id) {
                    ig.game.removeEntity(ig.game.entities[i]);
                    removed++;
                }
            }
            console.log('[INFO] Removing ' + removed + ' entities');
        },
        entityCreate: function(typeStr, x, y, settings, toSocket) {
            var data = { type: typeStr, x: x, y: y, settings: settings };
            var key = 'entity.create';
            if (toSocket) this.emit(toSocket, key, data);
            else this.broadcast(key, data);
        },
        classToString: function(classObj) {
            // Node has a relatively thin global object so
            // this is nowhere as stressful as the browser-side.
            var key = '';
            for (var i in global)
                if (global[i] == classObj)
                    key = i;
            return key;
        }
    });

    // No need to loads images, etc.
    ig.Loader.inject({
        load: function() {
            ig.system.setGame(this.gameClass);
        }
    });

    // Allow input to be triggered by clients.
    ig.Input.inject({
        set_keydown: function(action) {
			this.actions[action] = true;
			if (!this.locks[action]) {
				this.presses[action] = true;
				this.locks[action] = true;
			}
        },
        set_keyup: function(action) {
            this.delayedKeyup[action] = true;
        }
    });

    // System needs to reset client inputs.
    ig.System.inject({
        gameCnt: 0,
        setGame: function(gameClass) {
            this.parent(gameClass);
            this.gameCnt++;
            if (this.gameCnt <= 1) return;

            var key = ig.server.classToString(gameClass);
            ig.server.broadcast('system.set-game', { class: key });
        },
        setServer: function(serverClass) {
            ig.server = new (serverClass)();
        },
        run: function() {
            this.parent();
            // Clear all the inputs for the sockets.
            for (var i in ig.server.clients) {
                if (ig.server.clients[i] && ig.server.clients[i].input)
                    ig.server.clients[i].input.clearPressed();
            }
        }
    });

    // Rewrite this function to delay and allow the server class to setup.
    ig.main = function(canvasId, gameClass, fps, width, height, scale, loaderClass) {
        ig.system = new ig.System(canvasId, fps, width, height, scale || 1);
        ig.input = new ig.Input();
        ig.soundManager = new ig.SoundManager();
        ig.music = new ig.Music();
        ig.ready = true;

        var loader = new (loaderClass || ig.Loader)(gameClass, ig.resources);
        setTimeout(function() {
            loader.load();
        }, 100);
    };
});
