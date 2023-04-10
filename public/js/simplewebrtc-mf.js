function ice_server_update( ice_servers_config, client_props )
{
	var ice_servers = ice_servers_config;
	if( client_props.turn_server && client_props.turn_server.length > 0 )
	{
		ice_servers = [];
		
		if (ice_servers_config) {
			var length = ice_servers_config.length || 0;
			var turns = ice_servers_config;
			for (var i = 0; i < length; i++) {
				if ((turns[i].url && turns[i].url.includes('stun:')) ||
					(turns[i].urls && turns[i].urls.includes('stun:')) ||
					(turns[i].urls[0] && turns[i].urls[0].includes('stun:')))
					ice_servers.push(ice_servers_config[i]);
			}

			if (client_props.turn_server.includes(';')) {
				turns = client_props.turn_server.split(';');
				for (var i = 0; i < turns.length; i++) {
					if (turns[i].includes('@') && turns[i].includes('@')) {
						ice_servers.push({
							username: turns[i].substring(0, turns[i].indexOf('@')),
							credential: turns[i].substring(turns[i].indexOf('@') + 1, turns[i].indexOf(':')),
							urls: ['turn:' + turns[i].substring(turns[i].indexOf(':') + 1)]
						});
					}
				}
			}
			else if (client_props.turn_server.includes('@') && client_props.turn_server.includes(':')) {
				ice_servers.push({
					username: client_props.turn_server.substring(0, client_props.turn_server.indexOf('@')),
					credential: client_props.turn_server.substring(client_props.turn_server.indexOf('@') + 1, client_props.turn_server.indexOf(':')),
					urls: ['turn:' + client_props.turn_server.substring(client_props.turn_server.indexOf(':') + 1)]
				});
			}
			else if (client_props.turn_user && client_props.turn_password) {
				ice_servers.push({
					username: client_props.turn_user,
					credential: client_props.turn_password,
					urls: [client_props.turn_server]
				});
			}
		}
	}
	
	return ice_servers;
}


SimpleWebRTC.prototype.appointRoom = function (name, cb) {
    var self = this;
    this.roomName = name;
    this.connection.emit('join', name, function (err, roomDescription) {
        console.log('join CB', err, roomDescription);
        if (err) {
            self.emit('error', err);
        } 
      
        if (cb) cb(err, roomDescription);
        self.emit('joinedRoom', name);
    });
};

/////// updates for Medialooks MPlatform/MFormasts SDK ///////////////

SimpleWebRTC.prototype.setInfo = function (nickName, strongId, mode, multicast) {
    if (arguments.length > 1) {
        var nick = nickName || '';
        var sId = strongId || '';
        var mod = mode || '';
        var mc = multicast || '';
        if (nickName)
            this.nickName = nickName;

        if (strongId && !this.strongId)
            this.strongId = strongId;

        if (mode)
            this.mode = mode;

        if (multicast)
            this.multicastType = multicast;

        this.connection.emit('setinfo', { nickName: nick, strongId: sId, mode: mod, multicastType: mc, oneway: true });
    }
    else if (arguments.length == 1 && typeof nickName == 'object') {
        this.connection.emit('setinfo', nickName);
    }
};


SimpleWebRTC.prototype.joinRoom = function (name, cb) {
    var self = this;
    this.roomName = name;
    this.connection.emit('join', name, function (err, roomDescription) {
        console.log('join CB', err, roomDescription);
        if (err) {
            self.emit('error', err);
        } else {
            var id,
                client,
                type,
                peer;
            for (id in roomDescription.clients) {
                client = roomDescription.clients[id];
                for (type in client) {
                    if (self.config.target) {
                        if (typeof client[type] === 'boolean' && client[type] && (id == self.config.target || client.nickName == self.config.target)) {
                            peer = self.webrtc.createPeer({
                                id: id,
                                type: type,
                                nickName: client.nickName,
                                mode: client.mode,
                                vidEncoder: client.vidEncoder,
                                vidBitrate: client.vidBitrate,
                                audEncoder: client.audEncoder,
                                audBitrate: client.audBitrate,
                                enableDataChannels: self.config.enableDataChannels && type !== 'screen',
                                receiveMedia: {
                                    offerToReceiveAudio: type !== 'screen' && self.config.receiveMedia.offerToReceiveAudio ? 1 : 0,
                                    offerToReceiveVideo: self.config.receiveMedia.offerToReceiveVideo
                                }
                            });
                            self.emit('createdPeer', peer);
                            if (client.multicastType && client.multicastType == 'janus') {
                                var janusLisnterMsg = { to: id, toName: client.nickName, type: 'januslistner' }
                                self.connection.emit('message', janusLisnterMsg);
                            }
                            else
                                peer.start();
                        }
                    }
                    else {
                        if (typeof client[type] === 'boolean' && client[type]) {
                            peer = self.webrtc.createPeer({
                                id: id,
                                type: type,
                                nickName: client.nickName,
                                mode: client.mode,
                                vidEncoder: client.vidEncoder,
                                vidBitrate: client.vidBitrate,
                                audEncoder: client.audEncoder,
                                audBitrate: client.audBitrate,
                                enableDataChannels: self.config.enableDataChannels && type !== 'screen',
                                receiveMedia: {
                                    offerToReceiveAudio: type !== 'screen' && self.config.receiveMedia.offerToReceiveAudio ? 1 : 0,
                                    offerToReceiveVideo: self.config.receiveMedia.offerToReceiveVideo
                                }
                            });
                            self.emit('createdPeer', peer);
                            peer.start();
                        }
                    }
                }
            }
        }

        if (cb) cb(err, roomDescription);
        self.emit('joinedRoom', name);
    });
};




//SimpleWebRTC.prototype.joinRoom = function (name, cb) {
//    var self = this;
	
//	while (this.webrtc.peers.length) {
//            this.webrtc.peers[0].end();
//        }
//    if (this.getLocalScreen()) {
//            this.stopScreenShare();
//        }
	
//    this.roomName = name;

//    this.connection.emit('join', name, function (err, roomDescription) 
//	{
//        console.log('joinRoomML CB', err, roomDescription);
//        if (err) 
//		{
//            self.emit('join_error', err);
//        } 
//		else if(self.config.target) // Connect only if specified 'target'
//		{
//			var type = 'video'; // What if client.audio === true ?
//            var client = roomDescription.clients[self.config.target];
//			if(client && client[type] === true) 
//			{
//				// Update turn server (if have)
//				var peerConnectionConfig = {
//					iceServers: [{'urls': 'stun:stun.l.google.com:19302'}]
//				};
				
//				self.webrtc.config.peerConnectionConfig = self.webrtc.config.peerConnectionConfig || peerConnectionConfig;
//				self.webrtc.config.peerConnectionConfig.iceServers = 
//					ice_server_update(self.webrtc.config.peerConnectionConfig.iceServers, client);
				
//				var peer = self.webrtc.createPeer({
//					id: self.config.target,
//					type: type,
//					enableDataChannels: self.config.enableDataChannels && type !== 'screen',
//					receiveMedia: {
//						offerToReceiveAudio: type !== 'screen' && self.config.receiveMedia.offerToReceiveAudio ? 1 : 0,
//						offerToReceiveVideo: self.config.receiveMedia.offerToReceiveVideo
//					}
//				});
//				self.emit('createdPeer', peer);
//				peer.start();
//			}
//        }
//		else
//		{
//			// Have to update turn server for webguest (w/o input link)
//			// Expect at least VT_MNG in this room
//			for (id in roomDescription.clients) 
//			{
//                client = roomDescription.clients[id];
//				if (client && client['turn_server'] && client['turn_server'].length)
//				{
//					// Update turn server (if have)
//					var peerConnectionConfig = {
//						iceServers: [{'urls': 'stun:stun.l.google.com:19302'}]
//					};
					
//					self.webrtc.config.peerConnectionConfig = self.webrtc.config.peerConnectionConfig || peerConnectionConfig;
//					self.webrtc.config.peerConnectionConfig.iceServers = 
//						ice_server_update(self.webrtc.config.peerConnectionConfig.iceServers, client);
						
//					break;
//				}
//			 }
//		}	

//        if (cb) cb(err, roomDescription);
//        self.emit('joinedRoom', name);
//    });
//};

/*
SimpleWebRTC.prototype.handleRemoteStreamAdded = function (event) {
    var self = this;
    if (this.stream) {
        //Already have a remote stream. Lets add tracks to it
        var tracks = event.stream.getTracks();
        tracks.forEach(function (track) {
            track.addEventListener('ended', function () {
                if (isAllTracksEnded(self.stream)) {
                    self.end();
                }
            });
            self.stream.addTrack(track);
        });

        this.parent.emit('peerStreamAdded', this);
    } else {
        this.stream = event.stream;

        this.stream.getTracks().forEach(function (track) {
            track.addEventListener('ended', function () {
                if (isAllTracksEnded(self.stream)) {
                    self.end();
                }
            });
        });
    }
};*/

