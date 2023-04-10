var path = location.href;
var room = null;
var videoEl = null;
var targetId = null;
var signalingServer = null;
var channelsSet = "";

var arrChannels = [];

function getInputs() {
    return  [
        "channels-options",
        "channels-other"
    ];
}

if (path)
{
    //Parse path (it should look like (http(s)://signaling_server:port/room/targetpeerid_or_name  ))
    //Update 22/02/2019 - room NOT required anymore, only peer_id: https://signaling_server:port/peer_id
    var splitted = path.split('/');
    if (splitted.length > 3) {
        signalingServer = splitted[0] + '//' + splitted[2];
        room = splitted[3];
        targetId = splitted.length > 4 ? splitted[4] : room;
    }
}

var webrtc = new SimpleWebRTC({
    target: targetId,
    url: signalingServer,
    stunServer: 'stun:stun.l.google.com:19302',
    autoRequestMedia: true,
    debug: false,
    detectSpeakingEvents: false,
    autoAdjustMic: false
});

webrtc.setInfo("webReceiver", webrtc.connection.connection.id, 'receiver', '');

if (room) 
	webrtc.joinRoom(room);

webrtc.connection.on('roommembers', (result) => { 
    result.clients.forEach(client => {
        if (client.id == targetId)
            initChannelsSelection(client.audio_channels);
    });
});

webrtc.connection.on('memberjoined', (id, nickName, mode) => { 
   
    if (id.id == room) {
        
        webrtc.joinRoom(room);
        
    }
});

webrtc.on('readyToCall', function () {
    $('#connecttosigserv').attr('data-state', 'enabled');
    
    if (room) {
        webrtc.joinRoom(room);
    }
});

//Handle incoming video from target peer
webrtc.on('videoAdded', function (video, peer) {
    console.log('video added', peer);
    var container = document.getElementById('videoContainer');
	if (peer.type == "video") {
        $('#connecttopeer').attr('data-state', 'enabled');

        videoEl = video;
        //videoEl.muted = "muted";

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
webrtc.on('videoRemoved', function (video, peer) {
    console.log('video removed ', peer);
    var container = document.getElementById('videoContainer');
    if (peer.id == targetId || peer.nickName == targetId) {
        $('#connecttopeer').attr('data-state', 'disabled');

        videoEl = null;
        while (container.hasChildNodes())
            container.removeChild(container.lastChild);

        var videoStub = document.createElement('video');
        container.appendChild(videoStub);
    }
});

function enableOther(enable)
{
    $('#channels-other').css('visibility', enable ? "visible" : "hidden");
    $('#channels-other').prop('disabled', !enable);
    $('#channels-other').toggleClass("enabledInput", enable);
}

function checkOther() {
    let val = parseInt($('#channels-options').val());
    return -1 == val;
}

const sendMain = async() => {
    let strAudioIndex = $('#channels-options').val();
    let strAudio = arrChannels[strAudioIndex];

    if (strAudio)
        webrtc.connection.emit('setinfo', {used_audio: strAudio});
}

const sendOther = async() => {   
    let strAudio = $('#channels-other').val();
    webrtc.connection.emit('setinfo', {used_audio: strAudio});
}

const sendData = async(other) => {   
    if (other) {
        sendOther();
    } else {
        sendMain();    
    }
}

function handleChannelsOther() {
    storeData();
    sendData(checkOther());
}

function handleInputChannels() {
    storeData();
    enableOther(checkOther());
    sendData(checkOther());
}

const inputChannels = document.querySelector('select#channels-options');
const channelsOther = document.querySelector('input#channels-other');
inputChannels.onchange = () => handleInputChannels();
channelsOther.onchange = () => handleChannelsOther();

function initChannelsSelection(channels)
{
    if (channelsSet == channels)
        return;

    arrChannels = [];
    let arrChannelsOptions = [];
    let nChannels = parseInt(channels);

    for (i = 1, j = 0; i <= channels; i += 2, ++j)
    {
        let option = `${i},${i + 1}`;
        arrChannels.push(option);
        arrChannelsOptions.push(`<option value="${j}">${option}</option>`);
    }

    arrChannelsOptions.push(`<option value="-1">Other</option>`);
    inputChannels.innerHTML = arrChannelsOptions.join('');

    reStoreData();
    enableOther(checkOther());
    
    window.setTimeout(sendData, 1000, checkOther());

    channelsSet = channels;
};

function init() {
    enableOther(false);
}

$(document).ready(() => init());