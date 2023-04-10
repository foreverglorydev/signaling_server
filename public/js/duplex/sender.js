function createSenderConfig(oConf, oState) {
    var oMedia = {};
    var oLocalVideo  = {muted: true};

    if (mirrorOptions.value == "0") {
        oLocalVideo["mirror"] = false;
    } else {
        oLocalVideo["mirror"] = true;
    }
    oMedia = {
        video: { 
            deviceId: cameras[oState.inputOptions.value] 
        },
        audio: true
    };

    if (oState.resolutionOptions.value != "default") {
        var resol = resolutions[resolutionOptions.value];
        oMedia.video.width = resol[0];
        oMedia.video.height = resol[1];
    }

    let oRet = {
		url: signalingServer,
        localVideoEl: oConf.elName,
        autoRequestMedia: true,
        localVideo: oLocalVideo,
        media: oMedia,
        ...oConf.extra
    };
    
    return oRet;
}

function initCamera(oConf, oState) {
    let constr = createSenderConfig(oConf, oState); 
    oState.webrtc = new SimpleWebRTC({...constr});
};

function reStoreDataCustom() {
    var clientName = localStorage.getItem("clientName");
    if (clientName) 
        $('#clientName').val(clientName);
    else 
        $('#clientName').val("Guest" + Math.trunc(Math.random() * 10000));
}

function enableForm(enable) {
    var items = getInputs();

    items.forEach((item) => {
        $('#' + item).prop('disabled', !enable);
        $('#' + item).toggleClass("enabledInput", enable);
    });
}

// This method is only for Streamer (not for Duplex !!!)
function start(oConf, oState) {
    storeData();
	
	if (oConf.duplex)
	{
		alert("start - is not for Duplex");
		return;
	}

    if (validateData()) {
        let constr = createSenderConfig(oConf, oState);

       oState.webrtc = new SimpleWebRTC({
                ...constr,    
                stunServer: 'stun:stun.l.google.com:19302',
                detectSpeakingEvents: false,
                autoAdjustMic: false,
				receiveMedia: { offerToReceiveAudio: 0, offerToReceiveVideo: 0 }
            });
			
	    let room = localStorage.getItem("publisherId");

		// TODO: Generate unique ID for local PC (e.g. random string + store in localStorage)
        let peerInfo = {
            nickName: localStorage.getItem("clientName"),
            vidEncoder: localStorage.getItem("vidEncoder"),
            audEncoder: "opus",
            vidBitrate: localStorage.getItem("vidBitrate"),
          //  audBitrate: localStorage.getItem("audBitrate"),
            location: localStorage.getItem("location"),
			// Required for enumeration 
            submode: "webguest",
			// VVB: Note: have to specify 'sender' for VT < 1.7 compatibility
			mode: "sender" 
        };

        if (oConf.clientId) 
            peerInfo["id"] = oConf.clientId;
		
		// Support only h264 or VP9 (VP8 crash WebRTC obejct)
		if(peerInfo.vidEncoder != "h264")
			peerInfo.vidEncoder = "VP9";
	
        oState.webrtc.connection.emit('setinfo', peerInfo);

        oState.webrtc.on('readyToCall', function () {
			// VVB: we override joinRoom and connect ONLY 
			// to peer with id as specified in 'target' props of SimpleWebRTC object
			// if target is empty -> just enter into socket.io room
			if (room) 
				oState.webrtc.joinRoom(room);
        });

        $('#ConnectStatus').attr('data-state', 'enabled');
        $('#mainButton').attr("data-state", "started");
        $('#mainButton').text("Stop");
        // enableForm(false);
    } else {
        alert("Fill missing data");
    }
}

function stop(oConf, oState) {
    oState.webrtc.leaveRoom();
    oState.webrtc.disconnect();
    // Yes, it must be `oState.webrtc.webrtc`
    oState.webrtc.webrtc.localStreams.forEach(
        (stream) => {
            stream.getTracks().forEach(
                track => track.stop()
            );
        }
    );

    $('#ConnectStatus').attr('data-state', 'disabled');
    $('#mainButton').attr("data-state", "stopped");
    $('#mainButton').text("Start");
    
    enableForm(true);
    initCamera(oConf, oState);
};

// This method both for Duplex & Streamer
const initSender = async (oConf, oState) => {
    let strCamSel = await initCameraSelection();
    inputOptions.innerHTML = strCamSel;
    reStoreData(reStoreDataCustom);
    enableForm(true);
    initCamera(oConf, oState);

    $('#mainButton').click(function () {
        if ($('#mainButton').attr("data-state") == "stopped") 
			start(oConf, oState);
        else 
			stop(oConf, oState);
    });
};