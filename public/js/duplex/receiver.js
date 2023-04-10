function update_duplex_peer_info(oConf, oState)
{
	// Thus is have mean for first start 
	if( localStorage.length <= 0 )
		storeData();
	
	// TODO: Generate unique ID for local PC (e.g. random string + store in localStorage)
	let peerInfo = {
		nickName: localStorage.getItem("clientName"),
		vidEncoder: localStorage.getItem("vidEncoder"),
		audEncoder: "opus",
		vidBitrate: localStorage.getItem("vidBitrate"),
		//audBitrate: localStorage.getItem("audBitrate"),
		location: localStorage.getItem("location"),
		//Required for access via mp-link 
		mode: "receiver"
		// mode: "sender" - DO NOT USE - (appear in VT sources)
	};

	if (oConf.clientId) 
		peerInfo["id"] = oConf.clientId;
	
	// Support only h264 or VP9 (VP8 crash WebRTC obejct)
	if(peerInfo.vidEncoder != "h264")
		peerInfo.vidEncoder = "VP9";
	
	console.log('update_peer_info:', peerInfo );

	oState.webrtc.connection.emit('setinfo', peerInfo);
}


const initReceiver = async (oConf, oState) => {
    if (oState.webrtc === null)
    {
        oState.webrtc = new SimpleWebRTC({
            target: oConf.targetId,
            url: oConf.signalingServer,
            iceServers: 'stun:stun.l.google.com:19302',
            autoRequestMedia: false,
            debug: false,
            detectSpeakingEvents: false,
            autoAdjustMic: false
        });
	}
	
	oState.webrtc.connection.on('roommembers', (result) => {
		$('#connecttosigserv').attr('data-state', 'enabled');		
        result.clients.forEach(client => {
            if (client.id == oConf.targetId)
                initChannelsSelection(client.audio_channels, inputChannels, oState);
        });
    });
    
    oState.webrtc.connection.on('memberjoined', (id, nickName, mode) => { 
        if (id.id == oConf.room) {
			oState.webrtc.joinRoom(oConf.room);
		}
    });
    
    oState.webrtc.on('readyToCall', function () {
        $('#connecttosigserv').attr('data-state', 'enabled');
        
		if (oConf.room != oState.webrtc.roomName)
		{
			if( oState.webrtc.roomName)
				oState.webrtc.leaveRoom();
			
		    oState.webrtc.joinRoom(oConf.room);
		}
    });
    
    //Handle incoming video from target peer
    oState.webrtc.on('videoAdded', function (video, peer) {
        console.log('video added', peer);
        let container = document.getElementById('videoContainer');
        if (peer.type == "video" ) {
            
			
			$('#connecttopeer').attr('data-state', 'enabled');
    
			console.log('video created', peer);
			
            oState.videoEl = video;
            oState.videoEl.muted = oConf.duplex ? false : true; //"muted";
    
            while (container.hasChildNodes())
                container.removeChild(container.lastChild);
                
            video.setAttribute('loop', '');
            video.setAttribute('autoplay', 'true');
            video.setAttribute('controls', '');
            video.setAttribute('width', '100%');
            video.setAttribute('height', '100%');
    
            container.appendChild(video);
        }
    });
    
    //Handle removing video by target peer
    oState.webrtc.on('videoRemoved', function (video, peer) {
        console.log('video removed ', peer);
        let container = document.getElementById('videoContainer');
        if (peer.id == oConf.targetId || peer.nickName == oConf.targetId) {
            $('#connecttopeer').attr('data-state', 'disabled');
    
            oState.videoEl = null;
            while (container.hasChildNodes())
                container.removeChild(container.lastChild);
    
            let videoStub = document.createElement('video');
            container.appendChild(videoStub);
        }
    });
	
	if( oConf.duplex )
	{
		// For duplex wait readyToCall (called after init localMedia)
		update_duplex_peer_info(oConf, oState);
	}
    else if (oConf.room) 
	{
		// For receiver just join to room
		oState.webrtc.joinRoom(oConf.room);
	}
    
    inputChannels.onchange = () => handleInputChannels(oState);
    channelsOther.onchange = () => handleChannelsOther(oState);

    enableOtherChannels(false);
}

const inputChannels = document.querySelector('select#channels-options');
const channelsOther = document.querySelector('input#channels-other');