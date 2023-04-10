var channelsSet = "";
var arrChannels = [];

const sendMainChannels = async(oWebrtc) => {
    let strAudioIndex = $('#channels-options').val();
    let strAudio = arrChannels[strAudioIndex];

    if (strAudio)
        oWebrtc.webrtc.connection.emit('setinfo', {used_audio: strAudio});
}

const sendOtherChannels = async(oWebrtc) => {   
    let strAudio = $('#channels-other').val();
    oWebrtc.webrtc.connection.emit('setinfo', {used_audio: strAudio});
}

const sendDataChannels = async(other, oWebrtc) => {   
    if (other) {
        sendOtherChannels(oWebrtc);
    } else {
        sendMainChannels(oWebrtc);    
    }
}

function enableOtherChannels(enable)
{
    $('#channels-other').css('visibility', enable ? "visible" : "hidden");
    $('#channels-other').prop('disabled', !enable);
    $('#channels-other').toggleClass("enabledInput", enable);
}

function checkOtherChannels() {
    let val = parseInt($('#channels-options').val());
    return -1 == val;
}

function handleChannelsOther(oWebrtc) {
    storeData();
    sendDataChannels(checkOtherChannels(), oWebrtc);
}

function handleInputChannels(oWebrtc) {
    storeData();
    enableOtherChannels(checkOtherChannels());
    sendDataChannels(checkOtherChannels(), oWebrtc);
}

function initChannelsSelection(channels, oInputChannels, oWebrtc)
{
    if (channelsSet == channels)
        return;

    arrChannels = [];
    let arrChannelsOptions = [];
    let nChannels = parseInt(channels);

    for (i = 1, j = 0; i <= nChannels; i += 2, ++j)
    {
        let option = `${i},${i + 1}`;
        arrChannels.push(option);
        arrChannelsOptions.push(`<option value="${j}">${option}</option>`);
    }

    arrChannelsOptions.push(`<option value="-1">Other</option>`);
    oInputChannels.innerHTML = arrChannelsOptions.join('');

    reStoreData();
    enableOtherChannels(checkOtherChannels());
    
    window.setTimeout(sendDataChannels, 1000, checkOtherChannels(), oWebrtc);

    channelsSet = channels;
};