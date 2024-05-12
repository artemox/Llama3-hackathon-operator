import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import './ChatApp.css';  
import {DID_API} from './api_config.js';

const stream_warmup = true;
const maxRetryCount = 3;
const maxDelaySec = 4;

let peerConnection;
let streamId;
let sessionId;
let sessionClientAnswer;
let statsIntervalId;
let lastBytesReceived;
let videoIsPlaying = false;
let streamVideoOpacity = 0;
let pcDataChannel;
let isStreamReady = !stream_warmup;

// function onIceConnectionStateChange() {
//   iceStatusLabel.innerText = peerConnection.iceConnectionState;
//   iceStatusLabel.className = 'iceConnectionState-' + peerConnection.iceConnectionState;
//   if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'closed') {
//     stopAllStreams();
//     closePC();
//   }
// }

const presenterInputByService = {
  talks: {
    source_url: 'https://create-images-results.d-id.com/api_docs/assets/noelle.jpeg',
  },
  clips: {
    presenter_id: 'rian-lZC6MmWfC1',
    driver_id: 'mXra4jY38i',
  },
};


function onStreamEvent(message) {
  if (pcDataChannel.readyState === 'open') {
    let status;
    const [event, _] = message.data.split(':');

    switch (event) {
      case 'stream/started':
        status = 'started';
        break;
      case 'stream/done':
        status = 'done';
        break;
      case 'stream/ready':
        status = 'ready';
        break;
      case 'stream/error':
        status = 'error';
        break;
      default:
        status = 'dont-care';
        break;
    }

    // Set stream ready after a short delay, adjusting for potential timing differences between data and stream channels
    if (status === 'ready') {
      setTimeout(() => {
        console.log('stream/ready');
        isStreamReady = true;
        // streamEventLabel.innerText = 'ready';
        // streamEventLabel.className = 'streamEvent-ready';
      }, 1000);
    } else {
      console.log(event);
      // streamEventLabel.innerText = status === 'dont-care' ? event : status;
      // streamEventLabel.className = 'streamEvent-' + status;
    }
  }
}



function onSignalingStateChange() {
  // signalingStatusLabel.innerText = peerConnection.signalingState;
  // signalingStatusLabel.className = 'signalingState-' + peerConnection.signalingState;
}

function onIceGatheringStateChange() {
  // iceGatheringStatusLabel.innerText = peerConnection.iceGatheringState;
  // iceGatheringStatusLabel.className = 'iceGatheringState-' + peerConnection.iceGatheringState;
}

async function fetchWithRetries(url, options, retries = 1) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries <= maxRetryCount) {
      const delay = Math.min(Math.pow(2, retries) / 4 + Math.random(), maxDelaySec) * 1000;

      await new Promise((resolve) => setTimeout(resolve, delay));

      console.log(`Request failed, retrying ${retries}/${maxRetryCount}. Error ${err}`);
      return fetchWithRetries(url, options, retries + 1);
    } else {
      throw new Error(`Max retries exceeded. error: ${err}`);
    }
  }
}

function onIceCandidate(event) {
  console.log('onIceCandidate', event);
  if (event.candidate) {
    const { candidate, sdpMid, sdpMLineIndex } = event.candidate;

    fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/ice`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        candidate,
        sdpMid,
        sdpMLineIndex,
        session_id: sessionId,
      }),
    });
  } else {
    // For the initial 2 sec idle stream at the beginning of the connection, we utilize a null ice candidate.
    fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/ice`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
      }),
    });
  }
}


function stopAllStreams(streamVideoRef) {
  if (streamVideoRef.current && streamVideoRef.current.srcObject) {
    console.log('stopping video streams');
    streamVideoRef.current.srcObject.getTracks().forEach((track) => track.stop());
    streamVideoRef.current.srcObject = null;
    // setStreamVideoOpacity(0);
  }
}

function setStreamVideoElement(stream, streamVideoRef) {
  if (!stream) return;
  if (!streamVideoRef) return;

  streamVideoRef.current.srcObject = stream;
  streamVideoRef.current.loop = false;
  streamVideoRef.current.muted = !isStreamReady;

  // safari hotfix
  if (streamVideoRef.current.paused) {
    streamVideoRef.current.play().catch((e) => {});
  }
}

async function session_start(answer) {
  if (isStreamReady) {
    console.log('session_start', answer);
    const playResponse = await fetchWithRetries(`${DID_API.url}/${DID_API.service}/streams/${streamId}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "script": {
          "type": "text",
          "provider": {
              "type": "microsoft",
              "voice_id": "en-US-JennyNeural"
          },
          "ssml": "false",
          "input": `${answer}`
        },
        "config": {
          "fluent": "false",
          "pad_audio": "0.0"
        },
        "audio_optimization": "2",
        session_id: sessionId,
      }),
    });
  }
}

function ChatApp() {
  const [userInput, setUserInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const streamVideoRef = useRef(null);
  const idleVideoRef = useRef(null);

  async function connect(){
    const sessionResponse = await fetchWithRetries(`${DID_API.url}/${DID_API.service}/streams`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...presenterInputByService[DID_API.service], stream_warmup }),
    });
  
    const { id: newStreamId, offer, ice_servers: iceServers, session_id: newSessionId } = await sessionResponse.json();
    streamId = newStreamId;
    sessionId = newSessionId;
  
    try {
      sessionClientAnswer = await createPeerConnection(offer, iceServers);
    } catch (e) {
      console.log('error during streaming setup', e);
      stopAllStreams();
      closePC();
      return;
    }
  
    await fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/sdp`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        answer: sessionClientAnswer,
        session_id: sessionId,
      }),
    });
  }

  const onTrackCallback = useCallback((event) => {
    onTrack(event, streamVideoRef);
  }, [streamVideoRef]);

  function onConnectionStateChange() {
    // peerStatusLabel.innerText = peerConnection.connectionState;
    // peerStatusLabel.className = 'peerConnectionState-' + peerConnection.connectionState;
    if (peerConnection.connectionState === 'connected') {
      playIdleVideo();
      setTimeout(() => {
        if (!isStreamReady) {
          console.log('forcing stream/ready');
          isStreamReady = true;
          // streamEventLabel.innerText = 'ready';
          // streamEventLabel.className = 'streamEvent-ready';
        }
      }, 5000);
    }
  }

  const onTrack = (event, streamVideoRef) => {
    console.log("onTrack event:", event);
    if (!event.track) return;
  
    statsIntervalId = setInterval(async () => {
      const stats = await peerConnection.getStats(event.track);
      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
          if (!streamVideoRef) return;
          const videoStatusChanged = videoIsPlaying !== report.bytesReceived > lastBytesReceived;
          setStreamVideoElement(event.streams[0], streamVideoRef);
          if (videoStatusChanged) {
            videoIsPlaying = report.bytesReceived > lastBytesReceived;
            onVideoStatusChange(videoIsPlaying, event.streams[0],streamVideoRef);
          }
          lastBytesReceived = report.bytesReceived;
        }
      });
    }, 500);
  }

  function onVideoStatusChange(videoIsPlaying, stream, streamVideoRef) {
    let status;
    if (!streamVideoRef || !streamVideoRef.current) return;
    if (!idleVideoRef || !idleVideoRef.current) return;
  
    if (videoIsPlaying) {
      status = 'streaming';
      streamVideoOpacity = isStreamReady ? 1 : 0;
      setStreamVideoElement(stream);
    } else {
      status = 'empty';
      streamVideoOpacity = 0;
    }
  
    streamVideoRef.current.style.opacity = streamVideoOpacity;
    idleVideoRef.current.style.opacity = 1 - streamVideoOpacity;
  
    // streamingStatusLabel.innerText = status;
    // streamingStatusLabel.className = 'streamingState-' + status;
  }


  async function createPeerConnection(offer, iceServers) {
    if (!peerConnection) {
      peerConnection = new RTCPeerConnection({ iceServers });
      peerConnection.addEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
      peerConnection.addEventListener('icecandidate', onIceCandidate, true);
      peerConnection.addEventListener('connectionstatechange', onConnectionStateChange, true);
      peerConnection.addEventListener('signalingstatechange', onSignalingStateChange, true);
      peerConnection.addEventListener('track', onTrackCallback, true);
    }
  
    await peerConnection.setRemoteDescription(offer);
    const sessionClientAnswer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(sessionClientAnswer);
  
    return sessionClientAnswer;
  }

  function playIdleVideo() {
    console.log('playing idle video');
    if (idleVideoRef.current) {
      console.log('starting idle video');
      idleVideoRef.current.src = DID_API.service === 'clips' ? 'rian_idle.mp4' : './emma_idle.mp4';
      idleVideoRef.current.loop = true;
      console.log(idleVideoRef.current);
    }
  }

  useEffect(() => {
    const fetchStream = async () => {
      try {
        const result = await connect();
       } catch (error) {
        console.error('Failed to get stream:', error);
      }
    };
  
    fetchStream();

    return () => {
      stopAllStreams(streamVideoRef);
    };
  }, []);


function closePC(pc = peerConnection) {
  if (!pc) return;
  console.log('stopping peer connection');
  pc.close();
  pc.removeEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
  pc.removeEventListener('icecandidate', onIceCandidate, true);
  pc.removeEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
  pc.removeEventListener('connectionstatechange', onConnectionStateChange, true);
  pc.removeEventListener('signalingstatechange', onSignalingStateChange, true);
  pc.removeEventListener('track', onTrack, true);
  pc.removeEventListener('onmessage', onStreamEvent, true);

  clearInterval(statsIntervalId);
  isStreamReady = !stream_warmup;
  streamVideoOpacity = 0;
  // iceGatheringStatusLabel.innerText = '';
  // signalingStatusLabel.innerText = '';
  // iceStatusLabel.innerText = '';
  // peerStatusLabel.innerText = '';
  // streamEventLabel.innerText = '';
  console.log('stopped peer connection');
  if (pc === peerConnection) {
    peerConnection = null;
  }
}

function onIceConnectionStateChange() {
  //  iceStatusLabel.innerText = peerConnection.iceConnectionState;
  //  iceStatusLabel.className = 'iceConnectionState-' + peerConnection.iceConnectionState;
   if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'closed') {
     stopAllStreams();
     closePC();
   }
}

  const handleInputChange = (event) => {
    setUserInput(event.target.value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!userInput.trim()) return;

    const userMessage = { sender: 'User', text: userInput };
    setChatHistory(chatHistory => [...chatHistory, userMessage]);

    try {
      const response = await axios.post('http://localhost:8080/generate_answer', { user_input: userInput });
      console.log('API Response:', response.data);
      const botResponse = { sender: 'Bot', text: response.data.answer };
      setChatHistory(chatHistory => [...chatHistory, botResponse]);
      await session_start(response.data.answer)
    } catch (error) {
      console.error('Error sending message:', error);
    }

    setUserInput('');
  };

  return (
    <div className="chat-app">
      <header className="app-header">
        <img src="icon.png" className="app-icon" />
        <h1>Llama-Operator</h1>
      </header>
      <div className="main-container">
        <div className="left-container">
          <div className="avatar-container">
            <video
              ref={idleVideoRef}
              autoPlay
              loop
              className="idle-video"
              style={{ opacity: 1 }}
            />
            <video
              ref={streamVideoRef}
              autoPlay
              className="stream-video"
              style={{ opacity: 0, zIndex: 1 }}
            />
          </div>
          <form onSubmit={handleSubmit} className="chat-form">
            <input
              type="text"
              value={userInput}
              onChange={handleInputChange}
              placeholder="Type your message..."
            />
            <button type="submit">Send</button>
          </form>
        </div>
        <div className="chat-container">
          {chatHistory.map((chat, index) => (
            <div key={index} className="chat-message"><strong>{chat.sender}:</strong> {chat.text}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ChatApp;
