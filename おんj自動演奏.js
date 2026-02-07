// ==UserScript==
// @name         おんJピアノ 統合プレイヤー Pro v4.2
// @namespace    http://tampermonkey.net/
// @version      4.2.0
// @description  おんJピアノ自動演奏＆作曲ツール（ファイル入出力・途中再生強化）
// @author       AI Assistantとワイ
// @match        *://epiano.jp/*
// @match        *://*.epiano.jp/*
// @match        *://*.open2ch.net/lib/game/piano/*
// @match        *://*.open2ch.net/*piano*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const WSS_URL = 'wss://epiano.jp:2083/opiano/';
    const STORAGE_KEY = 'epiano_songs_v4';
    const CONFIG_KEY = 'epiano_config_v4';

    const CONFIG = {
        DEFAULT_BPM: 120,
        DEFAULT_VELOCITY: 80,
        NOTE_GAP_MS: 10
    };

    const INSTRUMENTS = [
        { id: 'piano1', name: 'ピアノ1', cat: 'ピアノ' },
        { id: 'piano2', name: 'ピアノ2', cat: 'ピアノ' },
        { id: 'piano3', name: 'ピアノ3', cat: 'ピアノ' },
        { id: 'piano4', name: 'ピアノ4', cat: 'ピアノ' },
        { id: 'ep1', name: 'エレピ1', cat: 'エレピ' },
        { id: 'ep2', name: 'エレピ2', cat: 'エレピ' },
        { id: 'org1', name: 'オルガン1', cat: 'オルガン' },
        { id: 'org2', name: 'オルガン2', cat: 'オルガン' },
        { id: 'bell1', name: 'ベル1', cat: 'ベル' },
        { id: 'bell2', name: 'ベル2', cat: 'ベル' },
        { id: 'chime', name: 'チャイム', cat: 'ベル' },
        { id: 'music', name: 'オルゴール', cat: 'ベル' },
        { id: 'gtr1', name: 'ギター1', cat: 'ギター' },
        { id: 'gtr2', name: 'ギター2', cat: 'ギター' },
        { id: 'gtr3', name: 'ギター3', cat: 'ギター' },
        { id: 'shami', name: 'シャミセン', cat: '和楽器' },
        { id: 'koto', name: 'コト', cat: '和楽器' },
        { id: 'bass1', name: 'ベース1', cat: 'ベース' },
        { id: 'bass2', name: 'ベース2', cat: 'ベース' },
        { id: 'bass3', name: 'ベース3', cat: 'ベース' },
        { id: 'lead1', name: 'リード1', cat: 'シンセ' },
        { id: 'lead2', name: 'リード2', cat: 'シンセ' },
        { id: 'sq8', name: '8bitリード', cat: 'シンセ' },
        { id: 'pad1', name: 'パッド1', cat: 'シンセ' },
        { id: 'pad2', name: 'パッド2', cat: 'シンセ' },
        { id: 'str1', name: 'ストリングス', cat: 'シンセ' },
        { id: 'chip1', name: 'チップ1', cat: 'チップ' },
        { id: 'chip2', name: 'チップ2', cat: 'チップ' },
        { id: 'chip3', name: 'ピコピコ', cat: 'チップ' },
        { id: 'cat', name: 'ネコニャー', cat: '効果音' },
        { id: 'frog', name: 'カエル', cat: '効果音' },
        { id: 'hoan', name: 'ホワーン', cat: '効果音' },
        { id: 'flute', name: 'フルート', cat: '管楽器' },
        { id: 'clar', name: 'クラリネット', cat: '管楽器' },
        { id: 'oboe', name: 'オーボエ', cat: '管楽器' },
        { id: 'sax', name: 'サックス', cat: '管楽器' },
        { id: 'brass', name: 'ブラス', cat: '管楽器' },
        { id: 'choir', name: 'コーラス', cat: 'ボーカル' },
        { id: 'harp', name: 'ハープ', cat: '弦楽器' },
        { id: 'marim', name: 'マリンバ', cat: '打楽器' },
        { id: 'vibra', name: 'ビブラフォン', cat: '打楽器' },
    ];

    let state = {
        socket: null,
        isConnected: false,
        userId: generateUserId(),
        isPlaying: false,
        isPaused: false,
        currentSong: null,
        songs: [],
        config: {
            bpm: CONFIG.DEFAULT_BPM,
            velocity: CONFIG.DEFAULT_VELOCITY,
            instrument: 'piano1',
            defaultInstrument: 'piano1'
        },
        editingSong: null,
        currentTrackIndex: 0,
        currentOctave: 4,
        inputMode: 'single',
        chordNotes: [],
        selectedNoteIndex: -1,
        clipboard: null,
        undoStack: [],
        redoStack: [],
        view: 'player',
        minimized: false,
        fullscreen: false,
        startFromBeat: 0,
        currentBeat: 0,
        totalBeats: 0,
        selectedSongId: null,
        previewMode: 'all',
        playbackTrackMode: 'all',
        previewStartBeat: 0
    };

    let playbackController = null;

    function generateUserId() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        return Array.from({ length: 2 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    }

    function getThreadId() {
        try {
            return new URL(window.location.href).searchParams.get('thread') || 'default';
        } catch (e) {
            return 'default';
        }
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const beatsToMs = (beats, bpm) => (beats * 60000) / bpm;

    function normalizeNote(note) {
        if (!note || typeof note !== 'string') return null;
        note = note.trim().toUpperCase();
        const m = note.match(/^([A-G])(#)?(\d)$/);
        return m ? m[1] + (m[2] || '') + m[3] : null;
    }

    function calculateTotalBeats(song) {
        if (!song) return 0;
        const tracks = song.tracks || [{ notes: song.notes || [] }];
        let maxBeats = 0;
        for (const track of tracks) {
            let beats = 0;
            for (const note of (track.notes || [])) {
                if (note.rest) beats += note.rest;
                else if (note.duration) beats += note.duration;
                else if (note.pedal !== undefined) beats += note.pedal;
            }
            if (beats > maxBeats) maxBeats = beats;
        }
        return maxBeats;
    }

    function formatDuration(beats, bpm) {
        const ms = beatsToMs(beats, bpm);
        const sec = Math.floor(ms / 1000);
        const min = Math.floor(sec / 60);
        const s = sec % 60;
        return `${min}:${s.toString().padStart(2, '0')}`;
    }

    // ファイル保存
    function downloadFile(content, filename, type = 'application/json') {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ファイル読み込み
    function openFileDialog(accept = '.json') {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = accept;
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => resolve({ name: file.name, content: ev.target.result });
                    reader.onerror = () => resolve(null);
                    reader.readAsText(file);
                } else {
                    resolve(null);
                }
            };
            input.click();
        });
    }

    function loadSongs() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            state.songs = data ? JSON.parse(data) : [];
        } catch (e) {
            state.songs = [];
        }
    }

    function saveSongs() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.songs));
        } catch (e) {}
    }

    function loadConfig() {
        try {
            const data = localStorage.getItem(CONFIG_KEY);
            if (data) state.config = { ...state.config, ...JSON.parse(data) };
        } catch (e) {}
    }

    function saveConfig() {
        try {
            localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
        } catch (e) {}
    }

    function addSong(song) {
        const newSong = {
            ...song,
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        state.songs.unshift(newSong);
        saveSongs();
        return newSong;
    }

    function deleteSong(id) {
        const idx = state.songs.findIndex(s => s.id === id);
        if (idx >= 0) {
            state.songs.splice(idx, 1);
            saveSongs();
            return true;
        }
        return false;
    }

    function getSong(id) {
        return state.songs.find(s => s.id === id) || null;
    }

    function connectWebSocket() {
        if (state.socket?.readyState === WebSocket.OPEN) return Promise.resolve();

        return new Promise((resolve, reject) => {
            try {
                state.socket = new WebSocket(WSS_URL);

                state.socket.onopen = () => {
                    state.isConnected = true;
                    state.socket.send(JSON.stringify({
                        type: 'hello',
                        threadId: getThreadId(),
                        userId: state.userId
                    }));
                    log('接続完了');
                    updateConnectionStatus();
                    resolve();
                };

                state.socket.onclose = () => {
                    state.isConnected = false;
                    updateConnectionStatus();
                    setTimeout(() => { if (!state.isConnected) connectWebSocket(); }, 3000);
                };

                state.socket.onerror = () => reject(new Error('WebSocket error'));
            } catch (e) {
                reject(e);
            }
        });
    }

    function sendNoteOn(note, velocity, instrument) {
        if (state.socket?.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({
            type: 'noteOn',
            note,
            velocity: velocity || state.config.velocity,
            instrument: instrument || state.config.defaultInstrument
        }));
    }

    function sendNoteOff(note) {
        if (state.socket?.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({ type: 'noteOff', note }));
    }

    function sendPedal(value) {
        if (state.socket?.readyState !== WebSocket.OPEN) return;
        state.socket.send(JSON.stringify({
            type: 'pedal',
            value: value,
            on: value >= 64
        }));
    }

    class PlaybackController {
        constructor() {
            this.isPlaying = false;
            this.isPaused = false;
            this.activeNotes = new Set();
            this.currentBeat = 0;
            this.pedalOn = false;
        }

        async play(song, startBeat = 0, trackIndices = null) {
            if (this.isPlaying) {
                await this.stop();
                await sleep(100);
            }

            this.isPlaying = true;
            this.isPaused = false;
            this.currentBeat = startBeat;
            state.currentSong = song;
            state.totalBeats = calculateTotalBeats(song);
            state.startFromBeat = startBeat;
            state.currentBeat = startBeat;

            updatePlayerUI();

            const bpm = song.bpm || CONFIG.DEFAULT_BPM;
            let tracks = song.tracks || [{ notes: song.notes || [] }];
            const defaultInstrument = song.defaultInstrument || state.config.defaultInstrument;

            if (trackIndices !== null && Array.isArray(trackIndices)) {
                tracks = tracks.filter((_, i) => trackIndices.includes(i));
            }

            const trackLabel = trackIndices !== null ? `(トラック ${trackIndices.map(i => i + 1).join(', ')} のみ)` : '';
            log(`再生開始: ${song.title || '無題'} ${startBeat > 0 ? `(${startBeat}拍目から)` : ''} ${trackLabel}`);

            try {
                await Promise.all(tracks.map(track => this.playTrack(track, bpm, defaultInstrument, startBeat)));
            } catch (e) {
                console.error('再生エラー:', e);
            }

            if (this.pedalOn) {
                sendPedal(0);
                this.pedalOn = false;
            }

            this.releaseAllNotes();
            this.isPlaying = false;
            this.isPaused = false;
            state.currentSong = null;
            updatePlayerUI();
            log('再生完了');
        }

        async playTrack(track, bpm, defaultInstrument, startBeat) {
            const notes = track.notes || [];
            const trackInstrument = track.instrument || defaultInstrument;
            let currentBeatPos = 0;

            for (let i = 0; i < notes.length; i++) {
                if (!this.isPlaying) break;

                const event = notes[i];

                let eventDuration = 0;
                if (event.rest) {
                    eventDuration = event.rest;
                } else if (event.duration) {
                    eventDuration = event.duration;
                } else if (event.pedal !== undefined) {
                    eventDuration = event.pedal;
                }

                const eventStartBeat = currentBeatPos;
                const eventEndBeat = currentBeatPos + eventDuration;

                if (eventEndBeat <= startBeat) {
                    currentBeatPos = eventEndBeat;
                    continue;
                }

                while (this.isPaused && this.isPlaying) {
                    await sleep(100);
                }
                if (!this.isPlaying) break;

                if (eventStartBeat < startBeat && eventEndBeat > startBeat) {
                    const skipBeats = startBeat - eventStartBeat;
                    const remainingBeats = eventDuration - skipBeats;
                    await this.playEventPartial(event, bpm, trackInstrument, remainingBeats);
                } else {
                    await this.playEvent(event, bpm, trackInstrument);
                }

                currentBeatPos = eventEndBeat;

                if (currentBeatPos > state.currentBeat) {
                    state.currentBeat = currentBeatPos;
                    this.currentBeat = currentBeatPos;
                    updateProgress();
                }
            }
        }

        async playEventPartial(event, bpm, trackInstrument, remainingBeats) {
            if (remainingBeats <= 0) return;

            const velocity = event.velocity || state.config.velocity;
            const instrument = event.instrument || trackInstrument;
            const remainingMs = beatsToMs(remainingBeats, bpm);

            if (event.pedal !== undefined) {
                const pedalValue = event.pedalValue !== undefined ? event.pedalValue : 127;
                sendPedal(pedalValue);
                this.pedalOn = pedalValue >= 64;
                await sleep(remainingMs);
                sendPedal(0);
                this.pedalOn = false;
                return;
            }

            if (event.rest) {
                await sleep(remainingMs);
                return;
            }

            if (event.note) {
                const note = normalizeNote(event.note);
                if (note) {
                    sendNoteOn(note, velocity, instrument);
                    this.activeNotes.add(note);
                    await sleep(remainingMs);
                    sendNoteOff(note);
                    this.activeNotes.delete(note);
                }
                await sleep(CONFIG.NOTE_GAP_MS);
                return;
            }

            if (event.notes?.length) {
                const noteItems = event.notes.map(n => {
                    if (typeof n === 'string') {
                        return { note: normalizeNote(n), instrument };
                    } else if (typeof n === 'object') {
                        return { note: normalizeNote(n.note), instrument: n.instrument || instrument };
                    }
                    return null;
                }).filter(Boolean);

                for (const item of noteItems) {
                    if (item.note) {
                        sendNoteOn(item.note, velocity, item.instrument);
                        this.activeNotes.add(item.note);
                    }
                    await sleep(2);
                }

                await sleep(remainingMs);

                for (const item of noteItems) {
                    if (item.note) {
                        sendNoteOff(item.note);
                        this.activeNotes.delete(item.note);
                    }
                }

                await sleep(CONFIG.NOTE_GAP_MS);
            }
        }

        async playEvent(event, bpm, trackInstrument) {
            const velocity = event.velocity || state.config.velocity;
            const instrument = event.instrument || trackInstrument;

            if (event.pedal !== undefined) {
                const pedalDuration = event.pedal;
                const pedalValue = event.pedalValue !== undefined ? event.pedalValue : 127;
                sendPedal(pedalValue);
                this.pedalOn = pedalValue >= 64;
                if (pedalDuration > 0) {
                    const pedalMs = beatsToMs(pedalDuration, bpm);
                    await sleep(pedalMs);
                    sendPedal(0);
                    this.pedalOn = false;
                }
                return;
            }

            if (event.rest) {
                const restMs = beatsToMs(event.rest, bpm);
                await sleep(restMs);
                return;
            }

            if (event.note) {
                const note = normalizeNote(event.note);
                const duration = event.duration || 1;
                const durationMs = beatsToMs(duration, bpm);
                if (note) {
                    sendNoteOn(note, velocity, instrument);
                    this.activeNotes.add(note);
                    await sleep(durationMs);
                    sendNoteOff(note);
                    this.activeNotes.delete(note);
                }
                await sleep(CONFIG.NOTE_GAP_MS);
                return;
            }

            if (event.notes?.length) {
                const duration = event.duration || 1;
                const durationMs = beatsToMs(duration, bpm);

                const noteItems = event.notes.map(n => {
                    if (typeof n === 'string') {
                        return { note: normalizeNote(n), instrument };
                    } else if (typeof n === 'object') {
                        return { note: normalizeNote(n.note), instrument: n.instrument || instrument };
                    }
                    return null;
                }).filter(Boolean);

                for (const item of noteItems) {
                    if (item.note) {
                        sendNoteOn(item.note, velocity, item.instrument);
                        this.activeNotes.add(item.note);
                    }
                    await sleep(2);
                }

                await sleep(durationMs);

                for (const item of noteItems) {
                    if (item.note) {
                        sendNoteOff(item.note);
                        this.activeNotes.delete(item.note);
                    }
                }

                await sleep(CONFIG.NOTE_GAP_MS);
            }
        }

        pause() {
            if (!this.isPlaying) return;
            this.isPaused = !this.isPaused;
            updatePlayerUI();
            log(this.isPaused ? '一時停止' : '再開');
        }

        async stop() {
            this.isPlaying = false;
            this.isPaused = false;
            if (this.pedalOn) {
                sendPedal(0);
                this.pedalOn = false;
            }
            this.releaseAllNotes();
            state.currentSong = null;
            state.currentBeat = 0;
            updatePlayerUI();
            log('停止');
        }

        releaseAllNotes() {
            for (const note of this.activeNotes) sendNoteOff(note);
            this.activeNotes.clear();
        }
    }

    function saveUndo() {
        if (!state.editingSong) return;
        state.undoStack.push(JSON.stringify(state.editingSong));
        if (state.undoStack.length > 50) state.undoStack.shift();
        state.redoStack = [];
    }

    function undo() {
        if (!state.undoStack.length) return;
        state.redoStack.push(JSON.stringify(state.editingSong));
        state.editingSong = JSON.parse(state.undoStack.pop());
        state.selectedNoteIndex = -1;
        updateComposerUI();
        showToast('元に戻しました');
    }

    function redo() {
        if (!state.redoStack.length) return;
        state.undoStack.push(JSON.stringify(state.editingSong));
        state.editingSong = JSON.parse(state.redoStack.pop());
        state.selectedNoteIndex = -1;
        updateComposerUI();
        showToast('やり直しました');
    }

    function getCurrentTrack() {
        if (!state.editingSong?.tracks) return null;
        return state.editingSong.tracks[state.currentTrackIndex] || state.editingSong.tracks[0];
    }

    function addNoteToTrack(noteData) {
        saveUndo();
        const track = getCurrentTrack();
        if (track) {
            track.notes = track.notes || [];
            track.notes.push(noteData);
            updateComposerUI();
        }
    }

    function log(msg) {
        const el = document.getElementById('ep-log');
        if (el) {
            const time = new Date().toLocaleTimeString();
            const line = document.createElement('div');
            line.className = 'ep-log-line';
            line.textContent = `[${time}] ${msg}`;
            el.insertBefore(line, el.firstChild);
            while (el.children.length > 50) el.removeChild(el.lastChild);
        }
        console.log('[EpianoPlayer]', msg);
    }

    function showToast(msg) {
        const existing = document.querySelector('.ep-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'ep-toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap');

            #ep-app {
                position: fixed;
                bottom: 12px;
                right: 12px;
                width: 420px;
                font-family: 'Noto Sans JP', sans-serif;
                font-size: 12px;
                z-index: 99999;
                user-select: none;
                transition: all 0.3s ease;
            }

            #ep-app.minimized { width: 180px; }
            #ep-app.minimized .ep-body { display: none; }

            #ep-app.fullscreen {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                width: 100%; height: 100%;
                border-radius: 0;
                z-index: 999999;
            }

            #ep-app.fullscreen .ep-card {
                height: 100%;
                border-radius: 0;
                display: flex;
                flex-direction: column;
            }

            #ep-app.fullscreen .ep-body {
                flex: 1;
                max-height: none;
                overflow-y: auto;
            }

            #ep-app * { box-sizing: border-box; margin: 0; padding: 0; }

            .ep-card {
                background: linear-gradient(145deg, rgba(24, 28, 42, 0.98), rgba(14, 18, 28, 0.98));
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 14px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(20px);
                overflow: hidden;
            }

            .ep-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 14px;
                background: linear-gradient(135deg, rgba(255, 200, 0, 0.12), rgba(255, 150, 0, 0.06));
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            }

            .ep-title {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 13px;
                font-weight: 700;
                color: #ffc107;
            }

            .ep-header-btns { display: flex; gap: 4px; }

            .ep-icon-btn {
                width: 26px; height: 26px;
                display: flex; align-items: center; justify-content: center;
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                color: #999; font-size: 12px;
                cursor: pointer; transition: all 0.2s;
            }

            .ep-icon-btn:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
            .ep-icon-btn.active { background: rgba(255, 193, 7, 0.3); color: #ffc107; }

            .ep-body { padding: 10px; max-height: 75vh; overflow-y: auto; }

            .ep-status-bar {
                display: flex; align-items: center; gap: 8px;
                padding: 6px 10px;
                background: rgba(0, 0, 0, 0.25);
                border-radius: 8px;
                margin-bottom: 10px;
            }

            .ep-status-dot {
                width: 8px; height: 8px;
                border-radius: 50%;
                background: #555;
                transition: all 0.3s;
            }

            .ep-status-dot.connected {
                background: #4caf50;
                box-shadow: 0 0 8px rgba(76, 175, 80, 0.6);
            }

            .ep-status-text { flex: 1; font-size: 10px; color: #888; }

            .ep-status-id {
                font-size: 10px; font-weight: 600;
                color: #ffc107;
                background: rgba(255, 193, 7, 0.15);
                padding: 2px 6px; border-radius: 4px;
            }

            .ep-tabs { display: flex; gap: 4px; margin-bottom: 10px; }

            .ep-tab {
                flex: 1; padding: 8px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 6px;
                color: #888; font-size: 11px; font-weight: 600;
                cursor: pointer; transition: all 0.2s;
                text-align: center;
            }

            .ep-tab:hover { background: rgba(255, 255, 255, 0.08); }

            .ep-tab.active {
                background: linear-gradient(135deg, rgba(255, 193, 7, 0.2), rgba(255, 152, 0, 0.1));
                border-color: rgba(255, 193, 7, 0.3);
                color: #ffc107;
            }

            .ep-section { margin-bottom: 10px; }

            .ep-section-title {
                font-size: 10px; font-weight: 600;
                color: #777;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 6px;
                display: flex; align-items: center; justify-content: space-between;
            }

            .ep-section-info { font-size: 10px; color: #4caf50; font-weight: normal; }

            .ep-select {
                width: 100%; padding: 8px 10px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: #fff; font-size: 12px;
                cursor: pointer;
            }

            .ep-select:focus { outline: none; border-color: rgba(255, 193, 7, 0.4); }

            .ep-song-card {
                padding: 10px;
                background: rgba(0, 0, 0, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 8px;
                margin-bottom: 8px;
            }

            .ep-song-card.selected {
                border-color: rgba(76, 175, 80, 0.5);
                background: rgba(76, 175, 80, 0.1);
            }

            .ep-song-title-row {
                display: flex; align-items: center; justify-content: space-between;
                margin-bottom: 6px;
            }

            .ep-song-name { font-size: 13px; font-weight: 600; color: #fff; }

            .ep-song-meta {
                display: flex; gap: 12px;
                font-size: 10px; color: #888;
            }

            .ep-song-meta span { display: flex; align-items: center; gap: 3px; }

            .ep-now-playing {
                display: flex; align-items: center; gap: 10px;
                padding: 10px;
                background: linear-gradient(135deg, rgba(76, 175, 80, 0.15), rgba(56, 142, 60, 0.1));
                border: 1px solid rgba(76, 175, 80, 0.25);
                border-radius: 8px;
                margin-bottom: 10px;
            }

            .ep-now-playing.hidden { display: none; }

            .ep-now-playing-icon {
                font-size: 18px;
                animation: ep-pulse 1s ease-in-out infinite;
            }

            @keyframes ep-pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.6; transform: scale(0.95); }
            }

            .ep-now-playing-info { flex: 1; min-width: 0; }

            .ep-now-playing-title {
                font-size: 12px; font-weight: 600; color: #81c784;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }

            .ep-now-playing-status { font-size: 10px; color: #a5d6a7; }

            .ep-progress-bar {
                height: 4px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 2px;
                margin-top: 6px;
                overflow: hidden;
            }

            .ep-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #4caf50, #8bc34a);
                border-radius: 2px;
                transition: width 0.2s;
            }

            .ep-controls { display: flex; gap: 6px; margin-bottom: 10px; }

            .ep-btn {
                flex: 1;
                display: flex; align-items: center; justify-content: center;
                gap: 4px; padding: 10px;
                border: none; border-radius: 8px;
                font-size: 12px; font-weight: 600;
                cursor: pointer; transition: all 0.2s;
            }

            .ep-btn:disabled { opacity: 0.4; cursor: not-allowed; }

            .ep-btn-play { background: linear-gradient(135deg, #4caf50, #388e3c); color: white; }
            .ep-btn-play:hover:not(:disabled) { background: linear-gradient(135deg, #66bb6a, #43a047); }

            .ep-btn-pause { background: linear-gradient(135deg, #ff9800, #f57c00); color: white; }
            .ep-btn-stop { background: linear-gradient(135deg, #f44336, #d32f2f); color: white; }

            .ep-btn-secondary {
                background: rgba(255, 255, 255, 0.06);
                color: #ccc;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .ep-btn-secondary:hover:not(:disabled) { background: rgba(255, 255, 255, 0.1); color: #fff; }

            .ep-btn-primary { background: linear-gradient(135deg, #ffc107, #ff9800); color: #1a1a2e; }

            .ep-btn-sm { padding: 6px 10px; font-size: 10px; flex: none; }

            .ep-start-beat-row {
                display: flex; align-items: center; gap: 8px;
                margin-bottom: 8px; padding: 8px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 6px;
            }

            .ep-start-beat-label { font-size: 10px; color: #888; }

            .ep-start-beat-input {
                width: 60px; padding: 4px 6px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                color: #fff; font-size: 11px;
                text-align: center;
            }

            .ep-settings { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }

            .ep-setting-item {
                padding: 8px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 6px;
            }

            .ep-setting-item.full { grid-column: span 2; }

            .ep-setting-label { font-size: 9px; color: #777; margin-bottom: 3px; }

            .ep-setting-value { display: flex; align-items: center; gap: 6px; }

            .ep-slider {
                flex: 1; height: 3px;
                -webkit-appearance: none;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 2px;
            }

            .ep-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 12px; height: 12px;
                border-radius: 50%;
                background: #ffc107;
                cursor: pointer;
            }

            .ep-slider-val {
                min-width: 28px;
                font-size: 11px; font-weight: 600;
                color: #ffc107;
                text-align: right;
            }

            .ep-actions { display: flex; gap: 4px; flex-wrap: wrap; }

            .ep-action-btn {
                flex: 1; min-width: 60px;
                padding: 6px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 6px;
                color: #888; font-size: 10px;
                cursor: pointer; transition: all 0.2s;
                text-align: center;
            }

            .ep-action-btn:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
            .ep-action-btn.danger:hover { background: rgba(244, 67, 54, 0.2); color: #ef5350; }

            .ep-log {
                max-height: 50px; overflow-y: auto;
                padding: 6px;
                background: rgba(0, 0, 0, 0.25);
                border-radius: 6px;
                font-family: 'Monaco', 'Consolas', monospace;
            }

            .ep-log-line { font-size: 9px; color: #666; padding: 1px 0; }

            .ep-toast {
                position: fixed;
                bottom: 80px; left: 50%;
                transform: translateX(-50%);
                padding: 10px 20px;
                background: rgba(0, 0, 0, 0.9);
                border-radius: 8px;
                color: #fff; font-size: 12px;
                z-index: 1000000;
                animation: ep-toast-in 0.3s ease;
            }

            @keyframes ep-toast-in {
                from { opacity: 0; transform: translate(-50%, 10px); }
                to { opacity: 1; transform: translate(-50%, 0); }
            }

            .ep-composer { display: none; }
            .ep-composer.active { display: block; }

            .ep-input {
                width: 100%; padding: 6px 10px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                color: #fff; font-size: 12px;
            }

            .ep-input:focus { outline: none; border-color: rgba(255, 193, 7, 0.4); }

            .ep-input-row { display: flex; gap: 6px; margin-bottom: 6px; }

            .ep-input-group { flex: 1; }

            .ep-track-tabs { display: flex; gap: 4px; margin-bottom: 6px; flex-wrap: wrap; }

            .ep-track-tab {
                padding: 5px 10px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 5px;
                color: #888; font-size: 10px;
                cursor: pointer;
            }

            .ep-track-tab.active {
                background: #4caf50;
                border-color: #4caf50;
                color: white;
            }

            .ep-mode-btns { display: flex; gap: 4px; justify-content: center; margin-bottom: 10px; }

            .ep-mode-btn {
                padding: 6px 12px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 6px;
                color: #888; font-size: 11px;
                cursor: pointer;
            }

            .ep-mode-btn.active {
                background: rgba(33, 150, 243, 0.25);
                border-color: #2196f3;
                color: #64b5f6;
            }

            .ep-chord-display {
                display: none;
                padding: 8px;
                background: rgba(255, 152, 0, 0.1);
                border: 1px solid rgba(255, 152, 0, 0.3);
                border-radius: 6px;
                margin-bottom: 10px;
                text-align: center;
                color: #ffb74d; font-size: 11px;
            }

            .ep-chord-display.active { display: block; }

            .ep-instrument-row {
                display: flex; align-items: center; gap: 6px;
                margin-bottom: 8px; padding: 6px 8px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 6px;
            }

            .ep-instrument-label { font-size: 10px; color: #888; white-space: nowrap; }

            .ep-instrument-select {
                flex: 1; padding: 4px 6px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                color: #fff; font-size: 10px;
                min-width: 0;
            }

            .ep-octave-btns { display: flex; justify-content: center; gap: 3px; margin-bottom: 10px; }

            .ep-oct-btn {
                width: 28px; height: 28px;
                display: flex; align-items: center; justify-content: center;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 5px;
                color: #888; font-size: 11px;
                cursor: pointer;
            }

            .ep-oct-btn.active {
                background: #ffc107;
                color: #1a1a2e;
                border-color: transparent;
            }

            .ep-piano-container {
                display: flex;
                justify-content: center;
                margin-bottom: 10px;
                overflow-x: auto;
            }

            .ep-piano {
                position: relative;
                height: 100px;
                display: inline-flex;
            }

            .ep-white-key {
                width: 32px;
                height: 100px;
                background: linear-gradient(to bottom, #fefefe 0%, #e8e8e8 100%);
                border: 1px solid #888;
                border-radius: 0 0 5px 5px;
                cursor: pointer;
                display: flex;
                align-items: flex-end;
                justify-content: center;
                padding-bottom: 6px;
                font-size: 10px;
                color: #555;
                position: relative;
                z-index: 1;
                flex-shrink: 0;
            }

            .ep-white-key:hover { background: linear-gradient(to bottom, #fff 0%, #ddd 100%); }
            .ep-white-key:active, .ep-white-key.active {
                background: linear-gradient(to bottom, #ffc107 0%, #ff9800 100%);
            }

            .ep-black-key {
                width: 22px;
                height: 60px;
                background: linear-gradient(to bottom, #333 0%, #111 100%);
                border: 1px solid #000;
                border-radius: 0 0 4px 4px;
                cursor: pointer;
                display: flex;
                align-items: flex-end;
                justify-content: center;
                padding-bottom: 4px;
                font-size: 8px;
                color: #999;
                position: absolute;
                top: 0;
                z-index: 2;
            }

            .ep-black-key:hover { background: linear-gradient(to bottom, #444 0%, #222 100%); }
            .ep-black-key:active, .ep-black-key.active {
                background: linear-gradient(to bottom, #d4a500 0%, #b38f00 100%);
            }

            .ep-note-list {
                max-height: 120px; overflow-y: auto;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 6px;
                margin-bottom: 6px;
            }

            .ep-note-item {
                display: flex; align-items: center;
                padding: 6px 8px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.04);
                cursor: pointer;
                font-size: 10px;
            }

            .ep-note-item:hover { background: rgba(255, 255, 255, 0.04); }
            .ep-note-item.selected { background: rgba(33, 150, 243, 0.2); }
            .ep-note-item:last-child { border-bottom: none; }

            .ep-note-num { width: 20px; color: #666; }
            .ep-note-content { flex: 1; color: #ccc; }
            .ep-note-content.rest { color: #888; }
            .ep-note-content.chord { color: #64b5f6; }
            .ep-note-content.pedal { color: #ff9800; }
            .ep-note-instrument { font-size: 9px; color: #ff9800; margin-left: 4px; }

            .ep-note-actions { display: flex; gap: 2px; }

            .ep-note-btn {
                width: 22px; height: 22px;
                display: flex; align-items: center; justify-content: center;
                background: none; border: none;
                border-radius: 4px;
                color: #888; font-size: 11px;
                cursor: pointer;
            }

            .ep-note-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
            .ep-note-btn.delete:hover { background: rgba(244, 67, 54, 0.2); color: #ef5350; }

            .ep-empty { text-align: center; padding: 16px; color: #666; font-size: 11px; }

            .ep-toolbar { display: flex; gap: 3px; flex-wrap: wrap; margin-bottom: 6px; }

            .ep-toolbar-btn {
                padding: 4px 8px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 4px;
                color: #888; font-size: 9px;
                cursor: pointer;
            }

            .ep-toolbar-btn:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
            .ep-toolbar-btn.danger:hover { background: rgba(244, 67, 54, 0.2); color: #ef5350; }

            .ep-edit-panel {
                display: none;
                padding: 8px;
                background: rgba(156, 39, 176, 0.1);
                border: 1px solid rgba(156, 39, 176, 0.3);
                border-radius: 6px;
                margin-bottom: 6px;
            }

            .ep-edit-panel.active { display: block; }

            .ep-edit-title { font-size: 10px; color: #ce93d8; margin-bottom: 6px; }

            .ep-json-area {
                width: 100%; height: 80px;
                padding: 6px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                color: #fff; font-size: 9px;
                font-family: 'Monaco', 'Consolas', monospace;
                resize: vertical;
                margin-bottom: 6px;
            }

            .ep-modal-overlay {
                position: fixed; inset: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex; align-items: center; justify-content: center;
                z-index: 1000001;
            }

            .ep-modal-overlay.hidden { display: none; }

            .ep-modal {
                width: 90%; max-width: 400px;
                background: linear-gradient(145deg, rgba(28, 32, 48, 0.98), rgba(18, 22, 36, 0.98));
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 16px;
            }

            .ep-modal-title { font-size: 14px; font-weight: 700; color: #ffc107; margin-bottom: 12px; }

            .ep-modal-btns { display: flex; gap: 8px; justify-content: flex-end; }

            .ep-song-list { max-height: 200px; overflow-y: auto; }

            .ep-song-item {
                display: flex; align-items: center;
                padding: 8px 10px;
                background: rgba(0, 0, 0, 0.15);
                border: 1px solid rgba(255, 255, 255, 0.04);
                border-radius: 6px;
                margin-bottom: 4px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .ep-song-item:hover {
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(255, 255, 255, 0.1);
            }

            .ep-song-item.selected {
                background: rgba(76, 175, 80, 0.15);
                border-color: rgba(76, 175, 80, 0.4);
            }

            .ep-song-item-info { flex: 1; }

            .ep-song-item-title { font-size: 12px; font-weight: 600; color: #fff; margin-bottom: 2px; }

            .ep-song-item-meta { font-size: 9px; color: #888; }

            .ep-song-item-actions { display: flex; gap: 4px; }

            .ep-song-item-btn {
                width: 24px; height: 24px;
                display: flex; align-items: center; justify-content: center;
                background: rgba(255, 255, 255, 0.05);
                border: none; border-radius: 4px;
                color: #888; font-size: 11px;
                cursor: pointer;
            }

            .ep-song-item-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
            .ep-song-item-btn.play { color: #4caf50; }
            .ep-song-item-btn.delete { color: #f44336; }

            .ep-preview-controls {
                display: flex; gap: 4px;
                padding: 8px;
                background: rgba(33, 150, 243, 0.1);
                border: 1px solid rgba(33, 150, 243, 0.3);
                border-radius: 6px;
                margin-bottom: 8px;
            }

            .ep-preview-controls.hidden { display: none; }

            .ep-preview-mode-btns { display: flex; gap: 4px; margin-bottom: 6px; }

            .ep-preview-mode-btn {
                flex: 1; padding: 6px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 4px;
                color: #888; font-size: 10px;
                cursor: pointer; text-align: center;
            }

            .ep-preview-mode-btn.active {
                background: rgba(33, 150, 243, 0.3);
                border-color: #2196f3;
                color: #64b5f6;
            }

            .ep-pedal-row {
                display: flex; align-items: center; gap: 6px;
                padding: 6px 8px;
                background: rgba(156, 39, 176, 0.1);
                border: 1px solid rgba(156, 39, 176, 0.2);
                border-radius: 6px;
                margin-bottom: 8px;
            }

            .ep-pedal-label { font-size: 10px; color: #ce93d8; }

            .ep-pedal-input {
                width: 50px; padding: 4px 6px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                color: #fff; font-size: 11px;
                text-align: center;
            }

            .ep-pedal-btn {
                padding: 4px 10px;
                background: rgba(156, 39, 176, 0.3);
                border: 1px solid rgba(156, 39, 176, 0.5);
                border-radius: 4px;
                color: #ce93d8; font-size: 10px;
                cursor: pointer;
            }

            .ep-pedal-btn:hover { background: rgba(156, 39, 176, 0.5); }

            .ep-playback-track-mode {
                display: flex; gap: 4px; margin-bottom: 8px;
            }

            .ep-playback-track-mode-btn {
                flex: 1; padding: 6px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 4px;
                color: #888; font-size: 10px;
                cursor: pointer; text-align: center;
            }

            .ep-playback-track-mode-btn.active {
                background: rgba(76, 175, 80, 0.3);
                border-color: #4caf50;
                color: #81c784;
            }

            .ep-track-select-row {
                display: none;
                align-items: center; gap: 6px;
                margin-bottom: 8px; padding: 6px 8px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 6px;
            }

            .ep-track-select-row.active { display: flex; }

            .ep-track-select-label { font-size: 10px; color: #888; white-space: nowrap; }

            .ep-track-select {
                flex: 1; padding: 4px 6px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                color: #fff; font-size: 10px;
            }

            .ep-file-actions {
                display: flex; gap: 4px; margin-top: 6px;
            }
        `;
        document.head.appendChild(style);
    }

    function generateInstrumentOptions(selectedId = 'piano1') {
        const categories = {};
        INSTRUMENTS.forEach(inst => {
            if (!categories[inst.cat]) categories[inst.cat] = [];
            categories[inst.cat].push(inst);
        });

        let html = '';
        for (const cat in categories) {
            html += `<optgroup label="${cat}">`;
            categories[cat].forEach(inst => {
                html += `<option value="${inst.id}" ${inst.id === selectedId ? 'selected' : ''}>${inst.name}</option>`;
            });
            html += '</optgroup>';
        }
        return html;
    }

    function createUI() {
        injectStyles();

        const app = document.createElement('div');
        app.id = 'ep-app';
        app.innerHTML = `
            <div class="ep-card">
                <div class="ep-header">
                    <div class="ep-title">
                        <span>🎹</span>
                        <span>Piano Player Pro</span>
                    </div>
                    <div class="ep-header-btns">
                        <button class="ep-icon-btn" id="ep-btn-fullscreen" title="フルスクリーン">⛶</button>
                        <button class="ep-icon-btn" id="ep-btn-minimize" title="最小化">−</button>
                    </div>
                </div>
                <div class="ep-body">
                    <div class="ep-status-bar">
                        <div class="ep-status-dot" id="ep-status-dot"></div>
                        <div class="ep-status-text" id="ep-status-text">接続中...</div>
                        <div class="ep-status-id" id="ep-status-id">ID: --</div>
                    </div>

                    <div class="ep-tabs">
                        <button class="ep-tab active" data-tab="player">▶ プレイヤー</button>
                        <button class="ep-tab" data-tab="composer">✏️ 作曲</button>
                    </div>

                    <!-- プレイヤー画面 -->
                    <div id="ep-player-view">
                        <div class="ep-now-playing hidden" id="ep-now-playing">
                            <div class="ep-now-playing-icon">🎵</div>
                            <div class="ep-now-playing-info">
                                <div class="ep-now-playing-title" id="ep-now-playing-title">-</div>
                                <div class="ep-now-playing-status" id="ep-now-playing-status">再生中</div>
                                <div class="ep-progress-bar">
                                    <div class="ep-progress-fill" id="ep-progress-fill" style="width: 0%;"></div>
                                </div>
                            </div>
                        </div>

                        <div class="ep-section">
                            <div class="ep-section-title">
                                曲ライブラリ
                                <span class="ep-section-info" id="ep-song-count">0曲</span>
                            </div>
                            <div class="ep-song-list" id="ep-song-list">
                                <div class="ep-empty">曲がありません</div>
                            </div>
                        </div>

                        <div class="ep-section" id="ep-selected-song-section" style="display: none;">
                            <div class="ep-section-title">選択中の曲</div>
                            <div class="ep-song-card selected">
                                <div class="ep-song-title-row">
                                    <span class="ep-song-name" id="ep-selected-song-name">-</span>
                                </div>
                                <div class="ep-song-meta">
                                    <span>🎵 <span id="ep-selected-bpm">-</span> BPM</span>
                                    <span>📏 <span id="ep-selected-beats">-</span> 拍</span>
                                    <span>⏱️ <span id="ep-selected-duration">-</span></span>
                                    <span>🎼 <span id="ep-selected-tracks">-</span> トラック</span>
                                </div>
                            </div>

                            <div class="ep-start-beat-row">
                                <span class="ep-start-beat-label">開始位置:</span>
                                <input type="number" class="ep-start-beat-input" id="ep-start-beat" value="0" min="0" step="1">
                                <span class="ep-start-beat-label">拍目から最後まで</span>
                            </div>

                            <div class="ep-playback-track-mode">
                                <button class="ep-playback-track-mode-btn active" data-mode="all">全トラック</button>
                                <button class="ep-playback-track-mode-btn" data-mode="track">選択トラックのみ</button>
                            </div>

                            <div class="ep-track-select-row" id="ep-player-track-select-row">
                                <span class="ep-track-select-label">再生トラック:</span>
                                <select class="ep-track-select" id="ep-player-track-select"></select>
                            </div>

                            <div class="ep-controls">
                                <button class="ep-btn ep-btn-play" id="ep-btn-play">▶ 再生</button>
                                <button class="ep-btn ep-btn-pause ep-btn-sm" id="ep-btn-pause" disabled>⏸</button>
                                <button class="ep-btn ep-btn-stop ep-btn-sm" id="ep-btn-stop" disabled>⏹</button>
                            </div>
                        </div>

                        <div class="ep-section">
                            <div class="ep-section-title">デフォルト設定</div>
                            <div class="ep-settings">
                                <div class="ep-setting-item">
                                    <div class="ep-setting-label">BPM上書き</div>
                                    <div class="ep-setting-value">
                                        <input type="range" class="ep-slider" id="ep-bpm" min="40" max="240" value="${state.config.bpm}">
                                        <span class="ep-slider-val" id="ep-bpm-val">${state.config.bpm}</span>
                                    </div>
                                </div>
                                <div class="ep-setting-item">
                                    <div class="ep-setting-label">音量</div>
                                    <div class="ep-setting-value">
                                        <input type="range" class="ep-slider" id="ep-velocity" min="1" max="127" value="${state.config.velocity}">
                                        <span class="ep-slider-val" id="ep-velocity-val">${state.config.velocity}</span>
                                    </div>
                                </div>
                                <div class="ep-setting-item full">
                                    <div class="ep-setting-label">デフォルト楽器</div>
                                    <select class="ep-select" id="ep-default-instrument" style="padding: 5px 8px; font-size: 11px;">
                                        ${generateInstrumentOptions(state.config.defaultInstrument)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="ep-section">
                            <div class="ep-section-title">ファイル操作</div>
                            <div class="ep-actions">
                                <button class="ep-action-btn" id="ep-btn-file-import">📂 ファイル読込</button>
                                <button class="ep-action-btn" id="ep-btn-file-export">💾 ファイル保存</button>
                            </div>
                            <div class="ep-file-actions">
                                <button class="ep-action-btn" id="ep-btn-import">📋 JSONインポート</button>
                                <button class="ep-action-btn" id="ep-btn-export">📄 JSONエクスポート</button>
                            </div>
                        </div>
                    </div>

                    <!-- 作曲画面 -->
                    <div id="ep-composer-view" class="ep-composer">
                        <div class="ep-section">
                            <div class="ep-input-row">
                                <div class="ep-input-group">
                                    <input type="text" class="ep-input" id="ep-song-title" placeholder="曲名">
                                </div>
                                <div class="ep-input-group" style="max-width: 70px;">
                                    <input type="number" class="ep-input" id="ep-song-bpm" placeholder="BPM" value="120" style="text-align: center;">
                                </div>
                            </div>
                            <div class="ep-instrument-row">
                                <span class="ep-instrument-label">デフォルト楽器:</span>
                                <select class="ep-instrument-select" id="ep-song-default-instrument">
                                    ${generateInstrumentOptions('piano1')}
                                </select>
                            </div>
                        </div>

                        <div class="ep-section">
                            <div class="ep-section-title">トラック</div>
                            <div class="ep-track-tabs" id="ep-track-tabs"></div>
                            <div class="ep-instrument-row">
                                <span class="ep-instrument-label">トラック楽器:</span>
                                <select class="ep-instrument-select" id="ep-track-instrument">
                                    <option value="">(デフォルト)</option>
                                    ${generateInstrumentOptions()}
                                </select>
                            </div>
                            <div class="ep-actions">
                                <button class="ep-action-btn" id="ep-add-track">+ 追加</button>
                                <button class="ep-action-btn" id="ep-rename-track">名前変更</button>
                                <button class="ep-action-btn danger" id="ep-del-track">削除</button>
                            </div>
                        </div>

                        <div class="ep-preview-controls hidden" id="ep-preview-controls">
                            <button class="ep-btn ep-btn-pause ep-btn-sm" id="ep-preview-pause">⏸</button>
                            <button class="ep-btn ep-btn-stop ep-btn-sm" id="ep-preview-stop">⏹</button>
                            <span style="flex:1; text-align:center; color:#64b5f6; font-size:10px;" id="ep-preview-status">プレビュー中...</span>
                        </div>

                        <div class="ep-section">
                            <div class="ep-mode-btns">
                                <button class="ep-mode-btn active" data-mode="single">単音</button>
                                <button class="ep-mode-btn" data-mode="chord">和音</button>
                                <button class="ep-mode-btn" data-mode="rest">休符</button>
                            </div>

                            <div class="ep-chord-display" id="ep-chord-display">
                                🎵 和音: <span id="ep-chord-notes">選択中...</span>
                                <button class="ep-btn ep-btn-sm ep-btn-primary" id="ep-confirm-chord" style="margin-left: 6px;">確定</button>
                            </div>

                            <div class="ep-instrument-row">
                                <span class="ep-instrument-label">この音の楽器:</span>
                                <select class="ep-instrument-select" id="ep-note-instrument">
                                    <option value="">(トラックの楽器)</option>
                                    ${generateInstrumentOptions()}
                                </select>
                            </div>

                            <div class="ep-pedal-row">
                                <span class="ep-pedal-label">🎹 ペダル</span>
                                <input type="number" class="ep-pedal-input" id="ep-pedal-duration" value="1" min="0.25" step="0.25" placeholder="拍">
                                <span class="ep-pedal-label">拍</span>
                                <button class="ep-pedal-btn" id="ep-add-pedal">追加</button>
                            </div>

                            <div class="ep-settings" style="margin-bottom: 10px;">
                                <div class="ep-setting-item">
                                    <div class="ep-setting-label">音価（拍）</div>
                                    <div class="ep-setting-value">
                                        <input type="range" class="ep-slider" id="ep-duration" min="0.25" max="4" step="0.25" value="1">
                                        <span class="ep-slider-val" id="ep-duration-val">1</span>
                                    </div>
                                </div>
                                <div class="ep-setting-item">
                                    <div class="ep-setting-label">強さ</div>
                                    <div class="ep-setting-value">
                                        <input type="range" class="ep-slider" id="ep-comp-velocity" min="1" max="127" value="80">
                                        <span class="ep-slider-val" id="ep-comp-velocity-val">80</span>
                                    </div>
                                </div>
                            </div>

                            <div class="ep-octave-btns">
                                ${[1,2,3,4,5,6,7].map(o => `<button class="ep-oct-btn ${o === 4 ? 'active' : ''}" data-oct="${o}">${o}</button>`).join('')}
                            </div>

                            <div class="ep-piano-container">
                                <div class="ep-piano" id="ep-piano"></div>
                            </div>
                        </div>

                        <div class="ep-section">
                            <div class="ep-section-title">
                                ノートリスト
                                <span class="ep-section-info" id="ep-track-beats">0拍</span>
                            </div>

                            <div class="ep-toolbar">
                                <button class="ep-toolbar-btn" id="ep-undo">↩戻す</button>
                                <button class="ep-toolbar-btn" id="ep-redo">↪</button>
                                <button class="ep-toolbar-btn" id="ep-copy">📋</button>
                                <button class="ep-toolbar-btn" id="ep-paste">📄</button>
                                <button class="ep-toolbar-btn" id="ep-move-up">⬆</button>
                                <button class="ep-toolbar-btn" id="ep-move-down">⬇</button>
                                <button class="ep-toolbar-btn danger" id="ep-clear">🗑</button>
                            </div>

                            <div class="ep-edit-panel" id="ep-edit-panel">
                                <div class="ep-edit-title">✏️ ノート編集</div>
                                <div class="ep-input-row">
                                    <input type="text" class="ep-input" id="ep-edit-notes" placeholder="C4 または C4,E4,G4 または pedal">
                                </div>
                                <div class="ep-input-row">
                                    <input type="number" class="ep-input" id="ep-edit-duration" placeholder="音価/拍" step="0.25" style="flex:1;">
                                    <input type="number" class="ep-input" id="ep-edit-velocity" placeholder="強さ" style="flex:1;">
                                    <select class="ep-input" id="ep-edit-instrument" style="flex:1;">
                                        <option value="">(デフォルト)</option>
                                        ${generateInstrumentOptions()}
                                    </select>
                                </div>
                                <div class="ep-actions">
                                    <button class="ep-action-btn" id="ep-edit-save">保存</button>
                                    <button class="ep-action-btn" id="ep-edit-cancel">キャンセル</button>
                                </div>
                            </div>

                            <div class="ep-note-list" id="ep-note-list">
                                <div class="ep-empty">ノートがありません</div>
                            </div>
                        </div>

                        <div class="ep-section">
                            <div class="ep-section-title">JSON</div>
                            <textarea class="ep-json-area" id="ep-json-area"></textarea>
                            <div class="ep-actions">
                                <button class="ep-action-btn" id="ep-json-load">読込</button>
                                <button class="ep-action-btn" id="ep-json-export">出力</button>
                            </div>
                        </div>

                        <div class="ep-section">
                            <div class="ep-section-title">プレビュー設定</div>
                            <div class="ep-preview-mode-btns">
                                <button class="ep-preview-mode-btn active" data-mode="all">全トラック</button>
                                <button class="ep-preview-mode-btn" data-mode="track">このトラックのみ</button>
                            </div>
                            <div class="ep-start-beat-row">
                                <span class="ep-start-beat-label">開始位置:</span>
                                <input type="number" class="ep-start-beat-input" id="ep-preview-start-beat" value="0" min="0" step="1">
                                <span class="ep-start-beat-label">拍目から</span>
                            </div>
                        </div>

                        <div class="ep-actions" style="margin-top: 8px;">
                            <button class="ep-btn ep-btn-primary" id="ep-save-song" style="flex: 1;">💾 保存</button>
                            <button class="ep-btn ep-btn-secondary" id="ep-preview-song" style="flex: 1;">▶ プレビュー</button>
                        </div>

                        <div class="ep-file-actions" style="margin-top: 6px;">
                            <button class="ep-action-btn" id="ep-composer-file-load">📂 ファイル読込</button>
                            <button class="ep-action-btn" id="ep-composer-file-save">💾 ファイル保存</button>
                        </div>
                    </div>

                    <div class="ep-section" style="margin-top: 10px;">
                        <div class="ep-section-title">ログ</div>
                        <div class="ep-log" id="ep-log"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(app);

        const modal = document.createElement('div');
        modal.className = 'ep-modal-overlay hidden';
        modal.id = 'ep-modal';
        modal.innerHTML = `
            <div class="ep-modal">
                <div class="ep-modal-title" id="ep-modal-title">インポート</div>
                <textarea class="ep-json-area" id="ep-modal-textarea" style="height: 150px;"></textarea>
                <div class="ep-modal-btns">
                    <button class="ep-btn ep-btn-secondary" id="ep-modal-cancel">キャンセル</button>
                    <button class="ep-btn ep-btn-primary" id="ep-modal-confirm">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        createPianoKeys();
        setupEventListeners();
        updateSongList();
    }

    function createPianoKeys() {
        const container = document.getElementById('ep-piano');
        if (!container) return;

        container.innerHTML = '';

        const whiteNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        const blackNotes = [
            { note: 'C#', offset: 0 },
            { note: 'D#', offset: 1 },
            { note: 'F#', offset: 3 },
            { note: 'G#', offset: 4 },
            { note: 'A#', offset: 5 }
        ];

        const whiteKeyWidth = 32;

        whiteNotes.forEach((note) => {
            const key = document.createElement('div');
            key.className = 'ep-white-key';
            key.dataset.note = note;
            key.textContent = note;
            key.addEventListener('click', () => handleKeyClick(note));
            container.appendChild(key);
        });

        blackNotes.forEach(({ note, offset }) => {
            const key = document.createElement('div');
            key.className = 'ep-black-key';
            key.dataset.note = note;
            key.textContent = note.replace('#', '♯');
            key.style.left = ((offset + 1) * whiteKeyWidth - 11) + 'px';
            key.addEventListener('click', (e) => {
                e.stopPropagation();
                handleKeyClick(note);
            });
            container.appendChild(key);
        });

        container.style.width = (whiteKeyWidth * 7) + 'px';
    }

    function handleKeyClick(noteName) {
        const fullNote = noteName + state.currentOctave;
        const duration = parseFloat(document.getElementById('ep-duration')?.value || 1);
        const velocity = parseInt(document.getElementById('ep-comp-velocity')?.value || 80);
        const noteInstrument = document.getElementById('ep-note-instrument')?.value || '';

        const previewInst = noteInstrument || getCurrentTrack()?.instrument || state.editingSong?.defaultInstrument || state.config.defaultInstrument;
        connectWebSocket().then(() => {
            sendNoteOn(fullNote, velocity, previewInst);
            setTimeout(() => sendNoteOff(fullNote), 200);
        });

        if (state.inputMode === 'chord') {
            const idx = state.chordNotes.findIndex(n => (typeof n === 'string' ? n : n.note) === fullNote);
            if (idx >= 0) {
                state.chordNotes.splice(idx, 1);
            } else {
                state.chordNotes.push(noteInstrument ? { note: fullNote, instrument: noteInstrument } : fullNote);
            }
            updateChordDisplay();
        } else if (state.inputMode === 'single') {
            const noteData = { note: fullNote, duration, velocity };
            if (noteInstrument) noteData.instrument = noteInstrument;
            addNoteToTrack(noteData);
        }
    }

    function updateChordDisplay() {
        const notesSpan = document.getElementById('ep-chord-notes');
        if (notesSpan) {
            const display = state.chordNotes.map(n => typeof n === 'string' ? n : `${n.note}(${n.instrument})`).join(' + ');
            notesSpan.textContent = display || '選択中...';
        }
    }

    function setupEventListeners() {
        document.getElementById('ep-btn-minimize')?.addEventListener('click', () => {
            const app = document.getElementById('ep-app');
            app?.classList.toggle('minimized');
            state.minimized = app?.classList.contains('minimized');
        });

        document.getElementById('ep-btn-fullscreen')?.addEventListener('click', () => {
            const app = document.getElementById('ep-app');
            app?.classList.toggle('fullscreen');
            state.fullscreen = app?.classList.contains('fullscreen');
            document.getElementById('ep-btn-fullscreen').classList.toggle('active', state.fullscreen);
        });

        document.querySelectorAll('.ep-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.ep-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const tabName = tab.dataset.tab;
                document.getElementById('ep-player-view').style.display = tabName === 'player' ? 'block' : 'none';
                document.getElementById('ep-composer-view').classList.toggle('active', tabName === 'composer');

                if (tabName === 'composer' && !state.editingSong) {
                    state.editingSong = {
                        title: '',
                        bpm: 120,
                        defaultInstrument: 'piano1',
                        tracks: [{ name: 'Track 1', notes: [], instrument: '' }]
                    };
                    state.currentTrackIndex = 0;
                    updateComposerUI();
                }
            });
        });

        document.querySelectorAll('.ep-playback-track-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.ep-playback-track-mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.playbackTrackMode = btn.dataset.mode;

                const trackSelectRow = document.getElementById('ep-player-track-select-row');
                if (trackSelectRow) {
                    trackSelectRow.classList.toggle('active', state.playbackTrackMode === 'track');
                }
            });
        });

        document.getElementById('ep-btn-play')?.addEventListener('click', async () => {
            const songId = state.selectedSongId;
            if (!songId) {
                showToast('曲を選択してください');
                return;
            }
            const song = getSong(songId);
            if (song) {
                const startBeat = parseFloat(document.getElementById('ep-start-beat')?.value || 0);

                let trackIndices = null;
                if (state.playbackTrackMode === 'track') {
                    const trackSelect = document.getElementById('ep-player-track-select');
                    if (trackSelect) {
                        trackIndices = [parseInt(trackSelect.value)];
                    }
                }

                await connectWebSocket();
                playbackController.play(song, startBeat, trackIndices);
            }
        });

        document.getElementById('ep-btn-pause')?.addEventListener('click', () => playbackController.pause());
        document.getElementById('ep-btn-stop')?.addEventListener('click', () => playbackController.stop());

        setupSlider('ep-bpm', 'ep-bpm-val', v => { state.config.bpm = v; saveConfig(); });
        setupSlider('ep-velocity', 'ep-velocity-val', v => { state.config.velocity = v; saveConfig(); });
        setupSlider('ep-duration', 'ep-duration-val');
        setupSlider('ep-comp-velocity', 'ep-comp-velocity-val');

        document.getElementById('ep-default-instrument')?.addEventListener('change', (e) => {
            state.config.defaultInstrument = e.target.value;
            saveConfig();
        });

        // ファイル読み込み（プレイヤー）
        document.getElementById('ep-btn-file-import')?.addEventListener('click', async () => {
            const result = await openFileDialog('.json');
            if (result) {
                try {
                    const data = JSON.parse(result.content);
                    addSong(data);
                    updateSongList();
                    showToast(`"${data.title || '無題'}" を読み込みました`);
                    log(`ファイル読込: ${result.name}`);
                } catch (e) {
                    showToast('ファイルの解析に失敗しました');
                }
            }
        });

        // ファイル保存（プレイヤー）
        document.getElementById('ep-btn-file-export')?.addEventListener('click', () => {
            if (!state.selectedSongId) {
                showToast('曲を選択してください');
                return;
            }
            const song = getSong(state.selectedSongId);
            if (song) {
                const filename = `${song.title || 'song'}.json`;
                downloadFile(JSON.stringify(song, null, 2), filename);
                showToast(`"${filename}" を保存しました`);
                log(`ファイル保存: ${filename}`);
            }
        });

        // JSONインポート
        document.getElementById('ep-btn-import')?.addEventListener('click', () => showModal('import'));
        document.getElementById('ep-btn-export')?.addEventListener('click', () => {
            if (!state.selectedSongId) { showToast('曲を選択してください'); return; }
            const song = getSong(state.selectedSongId);
            if (song) showModal('export', song);
        });

        // 作曲画面のファイル操作
        document.getElementById('ep-composer-file-load')?.addEventListener('click', async () => {
            const result = await openFileDialog('.json');
            if (result) {
                try {
                    const data = JSON.parse(result.content);
                    saveUndo();
                    state.editingSong = data;
                    if (!state.editingSong.tracks) {
                        state.editingSong.tracks = [{ name: 'Track 1', notes: state.editingSong.notes || [] }];
                    }
                    state.currentTrackIndex = 0;
                    state.selectedNoteIndex = -1;
                    document.getElementById('ep-song-title').value = state.editingSong.title || '';
                    document.getElementById('ep-song-bpm').value = state.editingSong.bpm || 120;
                    document.getElementById('ep-song-default-instrument').value = state.editingSong.defaultInstrument || 'piano1';
                    updateComposerUI();
                    showToast(`"${data.title || '無題'}" を読み込みました`);
                    log(`ファイル読込: ${result.name}`);
                } catch (e) {
                    showToast('ファイルの解析に失敗しました');
                }
            }
        });

        document.getElementById('ep-composer-file-save')?.addEventListener('click', () => {
            updateEditingSongFromUI();
            if (!state.editingSong) {
                showToast('曲がありません');
                return;
            }
            const filename = `${state.editingSong.title || 'song'}.json`;
            downloadFile(JSON.stringify(state.editingSong, null, 2), filename);
            showToast(`"${filename}" を保存しました`);
            log(`ファイル保存: ${filename}`);
        });

        document.querySelectorAll('.ep-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                if (mode === 'rest') {
                    const duration = parseFloat(document.getElementById('ep-duration')?.value || 1);
                    addNoteToTrack({ rest: duration });
                    return;
                }

                state.inputMode = mode;
                state.chordNotes = [];
                document.querySelectorAll('.ep-mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('ep-chord-display')?.classList.toggle('active', mode === 'chord');
                updateChordDisplay();
            });
        });

        document.getElementById('ep-confirm-chord')?.addEventListener('click', () => {
            if (state.chordNotes.length > 0) {
                const duration = parseFloat(document.getElementById('ep-duration')?.value || 1);
                const velocity = parseInt(document.getElementById('ep-comp-velocity')?.value || 80);
                const noteInstrument = document.getElementById('ep-note-instrument')?.value || '';

                const hasIndividualInstruments = state.chordNotes.some(n => typeof n === 'object');
                const noteData = { notes: state.chordNotes, duration, velocity };
                if (noteInstrument && !hasIndividualInstruments) noteData.instrument = noteInstrument;

                addNoteToTrack(noteData);
                state.chordNotes = [];
                updateChordDisplay();
            }
        });

        document.getElementById('ep-add-pedal')?.addEventListener('click', () => {
            const duration = parseFloat(document.getElementById('ep-pedal-duration')?.value || 1);
            addNoteToTrack({ pedal: duration, pedalValue: 127 });
            log(`ペダル追加: ${duration}拍`);
        });

        document.querySelectorAll('.ep-oct-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.currentOctave = parseInt(btn.dataset.oct);
                document.querySelectorAll('.ep-oct-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        document.getElementById('ep-add-track')?.addEventListener('click', () => {
            if (!state.editingSong) return;
            saveUndo();
            const idx = state.editingSong.tracks.length;
            state.editingSong.tracks.push({ name: `Track ${idx + 1}`, notes: [], instrument: '' });
            state.currentTrackIndex = idx;
            updateComposerUI();
        });

        document.getElementById('ep-rename-track')?.addEventListener('click', () => {
            const track = getCurrentTrack();
            if (!track) return;
            const name = prompt('トラック名:', track.name);
            if (name !== null) {
                track.name = name;
                updateComposerUI();
            }
        });

        document.getElementById('ep-del-track')?.addEventListener('click', () => {
            if (!state.editingSong || state.editingSong.tracks.length <= 1) {
                showToast('最低1トラック必要です');
                return;
            }
            if (confirm('このトラックを削除しますか？')) {
                saveUndo();
                state.editingSong.tracks.splice(state.currentTrackIndex, 1);
                state.currentTrackIndex = Math.min(state.currentTrackIndex, state.editingSong.tracks.length - 1);
                updateComposerUI();
            }
        });

        document.getElementById('ep-track-instrument')?.addEventListener('change', (e) => {
            const track = getCurrentTrack();
            if (track) {
                track.instrument = e.target.value;
                updateComposerUI();
            }
        });

        document.getElementById('ep-undo')?.addEventListener('click', undo);
        document.getElementById('ep-redo')?.addEventListener('click', redo);
        document.getElementById('ep-copy')?.addEventListener('click', () => {
            if (state.selectedNoteIndex < 0) { showToast('ノートを選択してください'); return; }
            const track = getCurrentTrack();
            if (track) {
                state.clipboard = JSON.parse(JSON.stringify(track.notes[state.selectedNoteIndex]));
                showToast('コピーしました');
            }
        });
        document.getElementById('ep-paste')?.addEventListener('click', () => {
            if (!state.clipboard) { showToast('コピーされたノートがありません'); return; }
            addNoteToTrack(JSON.parse(JSON.stringify(state.clipboard)));
            showToast('貼り付けました');
        });
        document.getElementById('ep-move-up')?.addEventListener('click', () => {
            const track = getCurrentTrack();
            if (!track || state.selectedNoteIndex <= 0) return;
            saveUndo();
            const idx = state.selectedNoteIndex;
            [track.notes[idx - 1], track.notes[idx]] = [track.notes[idx], track.notes[idx - 1]];
            state.selectedNoteIndex--;
            updateComposerUI();
        });
        document.getElementById('ep-move-down')?.addEventListener('click', () => {
            const track = getCurrentTrack();
            if (!track || state.selectedNoteIndex < 0 || state.selectedNoteIndex >= track.notes.length - 1) return;
            saveUndo();
            const idx = state.selectedNoteIndex;
            [track.notes[idx], track.notes[idx + 1]] = [track.notes[idx + 1], track.notes[idx]];
            state.selectedNoteIndex++;
            updateComposerUI();
        });
        document.getElementById('ep-clear')?.addEventListener('click', () => {
            const track = getCurrentTrack();
            if (!track) return;
            if (confirm('全てのノートを削除しますか？')) {
                saveUndo();
                track.notes = [];
                state.selectedNoteIndex = -1;
                updateComposerUI();
            }
        });

        document.getElementById('ep-edit-save')?.addEventListener('click', () => {
            const track = getCurrentTrack();
            if (!track || state.selectedNoteIndex < 0) return;

            saveUndo();
            const notesInput = document.getElementById('ep-edit-notes')?.value.trim() || '';
            const duration = parseFloat(document.getElementById('ep-edit-duration')?.value || 1);
            const velocity = parseInt(document.getElementById('ep-edit-velocity')?.value || 80);
            const instrument = document.getElementById('ep-edit-instrument')?.value || '';

            let newNote;
            if (notesInput === '休符' || notesInput.toLowerCase() === 'rest') {
                newNote = { rest: duration };
            } else if (notesInput.toLowerCase() === 'pedal' || notesInput === 'ペダル') {
                newNote = { pedal: duration, pedalValue: 127 };
            } else if (notesInput.includes(',')) {
                newNote = { notes: notesInput.split(',').map(n => n.trim().toUpperCase()), duration, velocity };
                if (instrument) newNote.instrument = instrument;
            } else {
                newNote = { note: notesInput.toUpperCase(), duration, velocity };
                if (instrument) newNote.instrument = instrument;
            }

            track.notes[state.selectedNoteIndex] = newNote;
            hideEditPanel();
            updateComposerUI();
            showToast('保存しました');
        });

        document.getElementById('ep-edit-cancel')?.addEventListener('click', hideEditPanel);

        document.getElementById('ep-json-load')?.addEventListener('click', () => {
            try {
                const data = JSON.parse(document.getElementById('ep-json-area')?.value || '{}');
                saveUndo();
                state.editingSong = data;
                if (!state.editingSong.tracks) {
                    state.editingSong.tracks = [{ name: 'Track 1', notes: state.editingSong.notes || [] }];
                }
                state.currentTrackIndex = 0;
                state.selectedNoteIndex = -1;
                document.getElementById('ep-song-title').value = state.editingSong.title || '';
                document.getElementById('ep-song-bpm').value = state.editingSong.bpm || 120;
                document.getElementById('ep-song-default-instrument').value = state.editingSong.defaultInstrument || 'piano1';
                updateComposerUI();
                showToast('読み込みました');
            } catch (e) {
                showToast('JSON解析エラー');
            }
        });

        document.getElementById('ep-json-export')?.addEventListener('click', () => {
            updateEditingSongFromUI();
            document.getElementById('ep-json-area').value = JSON.stringify(state.editingSong, null, 2);
            showToast('JSON出力しました');
        });

        document.querySelectorAll('.ep-preview-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.ep-preview-mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.previewMode = btn.dataset.mode;
            });
        });

        document.getElementById('ep-save-song')?.addEventListener('click', () => {
            updateEditingSongFromUI();
            if (!state.editingSong.title) {
                showToast('曲名を入力してください');
                return;
            }
            addSong(state.editingSong);
            updateSongList();
            showToast('保存しました');
        });

        // プレビュー再生（途中再生対応）
        document.getElementById('ep-preview-song')?.addEventListener('click', async () => {
            updateEditingSongFromUI();
            if (!state.editingSong?.tracks?.some(t => t.notes?.length)) {
                showToast('ノートがありません');
                return;
            }
            await connectWebSocket();

            const trackIndices = state.previewMode === 'track' ? [state.currentTrackIndex] : null;
            const startBeat = parseFloat(document.getElementById('ep-preview-start-beat')?.value || 0);

            document.getElementById('ep-preview-controls')?.classList.remove('hidden');
            const modeText = state.previewMode === 'track' ? `トラック${state.currentTrackIndex + 1}` : '全トラック';
            const startText = startBeat > 0 ? `${startBeat}拍目から` : '';
            document.getElementById('ep-preview-status').textContent = `${modeText}を${startText}プレビュー中...`;

            await playbackController.play(state.editingSong, startBeat, trackIndices);
            document.getElementById('ep-preview-controls')?.classList.add('hidden');
        });

        document.getElementById('ep-preview-pause')?.addEventListener('click', () => {
            playbackController.pause();
            document.getElementById('ep-preview-status').textContent =
                playbackController.isPaused ? '一時停止中' : 'プレビュー中...';
        });

        document.getElementById('ep-preview-stop')?.addEventListener('click', () => {
            playbackController.stop();
            document.getElementById('ep-preview-controls')?.classList.add('hidden');
        });

        document.getElementById('ep-modal-cancel')?.addEventListener('click', hideModal);
        document.getElementById('ep-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'ep-modal') hideModal();
        });
    }

    function setupSlider(sliderId, valId, onChange) {
        const slider = document.getElementById(sliderId);
        const val = document.getElementById(valId);
        if (slider && val) {
            slider.addEventListener('input', () => {
                val.textContent = slider.value;
                if (onChange) onChange(parseFloat(slider.value));
            });
        }
    }

    function updateEditingSongFromUI() {
        if (!state.editingSong) return;
        state.editingSong.title = document.getElementById('ep-song-title')?.value || '';
        state.editingSong.bpm = parseInt(document.getElementById('ep-song-bpm')?.value || 120);
        state.editingSong.defaultInstrument = document.getElementById('ep-song-default-instrument')?.value || 'piano1';
    }

    function updateConnectionStatus() {
        const dot = document.getElementById('ep-status-dot');
        const text = document.getElementById('ep-status-text');
        const id = document.getElementById('ep-status-id');

        if (state.isConnected) {
            dot?.classList.add('connected');
            if (text) text.textContent = '接続中';
            if (id) id.textContent = `ID: ${state.userId}`;
        } else {
            dot?.classList.remove('connected');
            if (text) text.textContent = '未接続';
            if (id) id.textContent = 'ID: --';
        }
    }

    function updateSongList() {
        const listContainer = document.getElementById('ep-song-list');
        const countEl = document.getElementById('ep-song-count');

        if (countEl) countEl.textContent = `${state.songs.length}曲`;

        if (!listContainer) return;

        if (state.songs.length === 0) {
            listContainer.innerHTML = '<div class="ep-empty">曲がありません。作曲タブで作成するか、ファイルを読み込んでください。</div>';
            return;
        }

        listContainer.innerHTML = state.songs.map(song => {
            const totalBeats = calculateTotalBeats(song);
            const duration = formatDuration(totalBeats, song.bpm || 120);
            const trackCount = (song.tracks || [{ notes: song.notes || [] }]).length;
            const isSelected = state.selectedSongId === song.id;

            return `
                <div class="ep-song-item ${isSelected ? 'selected' : ''}" data-id="${song.id}">
                    <div class="ep-song-item-info">
                        <div class="ep-song-item-title">${song.title || '無題'}</div>
                        <div class="ep-song-item-meta">${song.bpm || 120}BPM • ${totalBeats}拍 • ${duration} • ${trackCount}トラック</div>
                    </div>
                    <div class="ep-song-item-actions">
                        <button class="ep-song-item-btn play" data-action="play" data-id="${song.id}" title="再生">▶</button>
                        <button class="ep-song-item-btn" data-action="edit" data-id="${song.id}" title="編集">✏️</button>
                        <button class="ep-song-item-btn delete" data-action="delete" data-id="${song.id}" title="削除">×</button>
                    </div>
                </div>
            `;
        }).join('');

        listContainer.querySelectorAll('.ep-song-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.ep-song-item-btn')) return;
                selectSong(item.dataset.id);
            });
        });

        listContainer.querySelectorAll('.ep-song-item-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const id = btn.dataset.id;

                if (action === 'play') {
                    selectSong(id);
                    const song = getSong(id);
                    if (song) {
                        await connectWebSocket();
                        playbackController.play(song, 0);
                    }
                } else if (action === 'edit') {
                    const song = getSong(id);
                    if (song) {
                        state.editingSong = JSON.parse(JSON.stringify(song));
                        state.currentTrackIndex = 0;
                        state.selectedNoteIndex = -1;

                        document.getElementById('ep-song-title').value = state.editingSong.title || '';
                        document.getElementById('ep-song-bpm').value = state.editingSong.bpm || 120;
                        document.getElementById('ep-song-default-instrument').value = state.editingSong.defaultInstrument || 'piano1';

                        document.querySelectorAll('.ep-tab').forEach(t => t.classList.remove('active'));
                        document.querySelector('.ep-tab[data-tab="composer"]')?.classList.add('active');
                        document.getElementById('ep-player-view').style.display = 'none';
                        document.getElementById('ep-composer-view').classList.add('active');

                        updateComposerUI();
                        showToast('編集モードで開きました');
                    }
                } else if (action === 'delete') {
                    if (confirm('この曲を削除しますか？')) {
                        deleteSong(id);
                        if (state.selectedSongId === id) {
                            state.selectedSongId = null;
                            document.getElementById('ep-selected-song-section').style.display = 'none';
                        }
                        updateSongList();
                        showToast('削除しました');
                    }
                }
            });
        });
    }

    function selectSong(id) {
        state.selectedSongId = id;
        const song = getSong(id);

        updateSongList();

        const section = document.getElementById('ep-selected-song-section');
        if (section && song) {
            section.style.display = 'block';

            document.getElementById('ep-selected-song-name').textContent = song.title || '無題';
            document.getElementById('ep-selected-bpm').textContent = song.bpm || 120;

            const totalBeats = calculateTotalBeats(song);
            document.getElementById('ep-selected-beats').textContent = totalBeats;
            document.getElementById('ep-selected-duration').textContent = formatDuration(totalBeats, song.bpm || 120);

            const tracks = song.tracks || [{ notes: song.notes || [], name: 'Track 1' }];
            const trackCount = tracks.length;
            document.getElementById('ep-selected-tracks').textContent = trackCount;

            document.getElementById('ep-start-beat').max = totalBeats;
            document.getElementById('ep-start-beat').value = 0;

            const trackSelect = document.getElementById('ep-player-track-select');
            if (trackSelect) {
                trackSelect.innerHTML = tracks.map((track, i) =>
                    `<option value="${i}">${track.name || `Track ${i + 1}`}</option>`
                ).join('');
            }
        }
    }

    function updatePlayerUI() {
        const playBtn = document.getElementById('ep-btn-play');
        const pauseBtn = document.getElementById('ep-btn-pause');
        const stopBtn = document.getElementById('ep-btn-stop');
        const nowPlaying = document.getElementById('ep-now-playing');
        const nowPlayingTitle = document.getElementById('ep-now-playing-title');
        const nowPlayingStatus = document.getElementById('ep-now-playing-status');

        if (playbackController?.isPlaying) {
            if (playBtn) playBtn.disabled = true;
            if (pauseBtn) pauseBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = false;

            nowPlaying?.classList.remove('hidden');
            if (nowPlayingTitle) nowPlayingTitle.textContent = state.currentSong?.title || '無題';
            if (nowPlayingStatus) nowPlayingStatus.textContent = playbackController.isPaused ? '一時停止中' : '再生中';

            if (pauseBtn) pauseBtn.textContent = playbackController.isPaused ? '▶' : '⏸';
        } else {
            if (playBtn) playBtn.disabled = false;
            if (pauseBtn) pauseBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = true;

            nowPlaying?.classList.add('hidden');
        }
    }

    function updateProgress() {
        const fill = document.getElementById('ep-progress-fill');
        if (fill && state.totalBeats > 0) {
            const percent = Math.min(100, (state.currentBeat / state.totalBeats) * 100);
            fill.style.width = percent + '%';
        }
    }

    function updateComposerUI() {
        if (!state.editingSong) return;

        const tabsContainer = document.getElementById('ep-track-tabs');
        if (tabsContainer) {
            tabsContainer.innerHTML = state.editingSong.tracks.map((track, i) => `
                <button class="ep-track-tab ${i === state.currentTrackIndex ? 'active' : ''}" data-index="${i}">
                    ${track.name || `Track ${i + 1}`}
                </button>
            `).join('');

            tabsContainer.querySelectorAll('.ep-track-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    state.currentTrackIndex = parseInt(tab.dataset.index);
                    state.selectedNoteIndex = -1;
                    updateComposerUI();
                });
            });
        }

        const trackInstrumentSelect = document.getElementById('ep-track-instrument');
        if (trackInstrumentSelect) {
            const track = getCurrentTrack();
            trackInstrumentSelect.value = track?.instrument || '';
        }

        const trackBeatsEl = document.getElementById('ep-track-beats');
        if (trackBeatsEl) {
            const track = getCurrentTrack();
            let beats = 0;
            for (const note of (track?.notes || [])) {
                if (note.rest) beats += note.rest;
                else if (note.duration) beats += note.duration;
                else if (note.pedal !== undefined) beats += note.pedal;
            }
            trackBeatsEl.textContent = `${beats}拍`;
        }

        // プレビュー開始位置の最大値を更新
        const previewStartBeatInput = document.getElementById('ep-preview-start-beat');
        if (previewStartBeatInput) {
            const totalBeats = calculateTotalBeats(state.editingSong);
            previewStartBeatInput.max = totalBeats;
        }

        const listContainer = document.getElementById('ep-note-list');
        if (listContainer) {
            const track = getCurrentTrack();
            const notes = track?.notes || [];

            if (notes.length === 0) {
                listContainer.innerHTML = '<div class="ep-empty">ノートがありません</div>';
            } else {
                listContainer.innerHTML = notes.map((n, i) => {
                    let content = '';
                    let cls = '';
                    let instLabel = '';

                    if (n.pedal !== undefined) {
                        content = `🎹 ペダル (${n.pedal}拍)`;
                        cls = 'pedal';
                    } else if (n.rest) {
                        content = `🔇 休符 (${n.rest}拍)`;
                        cls = 'rest';
                    } else if (n.notes) {
                        const noteStr = n.notes.map(note => typeof note === 'string' ? note : `${note.note}`).join('+');
                        content = `🎵 ${noteStr} (${n.duration}拍)`;
                        cls = 'chord';
                        if (n.instrument) instLabel = n.instrument;
                    } else if (n.note) {
                        content = `♪ ${n.note} (${n.duration}拍, v${n.velocity || 80})`;
                        if (n.instrument) instLabel = n.instrument;
                    }

                    return `
                        <div class="ep-note-item ${i === state.selectedNoteIndex ? 'selected' : ''}" data-index="${i}">
                            <span class="ep-note-num">${i + 1}</span>
                            <span class="ep-note-content ${cls}">${content}</span>
                            ${instLabel ? `<span class="ep-note-instrument">[${instLabel}]</span>` : ''}
                            <div class="ep-note-actions">
                                <button class="ep-note-btn" data-action="play" data-index="${i}" title="試聴">▶</button>
                                <button class="ep-note-btn" data-action="edit" data-index="${i}" title="編集">✏️</button>
                                <button class="ep-note-btn delete" data-action="delete" data-index="${i}" title="削除">×</button>
                            </div>
                        </div>
                    `;
                }).join('');

                listContainer.querySelectorAll('.ep-note-item').forEach(item => {
                    item.addEventListener('click', (e) => {
                        if (e.target.closest('.ep-note-btn')) return;
                        state.selectedNoteIndex = parseInt(item.dataset.index);
                        updateComposerUI();
                    });
                });

                listContainer.querySelectorAll('.ep-note-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const action = btn.dataset.action;
                        const idx = parseInt(btn.dataset.index);
                        const track = getCurrentTrack();

                        if (action === 'play') {
                            const note = track.notes[idx];
                            await connectWebSocket();
                            const inst = note.instrument || track.instrument || state.editingSong?.defaultInstrument || 'piano1';

                            if (note.pedal !== undefined) {
                                sendPedal(127);
                                setTimeout(() => sendPedal(0), beatsToMs(note.pedal, state.editingSong?.bpm || 120));
                            } else if (note.note) {
                                sendNoteOn(note.note, note.velocity || 80, inst);
                                setTimeout(() => sendNoteOff(note.note), 300);
                            } else if (note.notes) {
                                for (const n of note.notes) {
                                    const noteStr = typeof n === 'string' ? n : n.note;
                                    const noteInst = (typeof n === 'object' && n.instrument) ? n.instrument : inst;
                                    sendNoteOn(noteStr, note.velocity || 80, noteInst);
                                }
                                setTimeout(() => {
                                    for (const n of note.notes) {
                                        const noteStr = typeof n === 'string' ? n : n.note;
                                        sendNoteOff(noteStr);
                                    }
                                }, 300);
                            }
                        } else if (action === 'edit') {
                            showEditPanel(idx);
                        } else if (action === 'delete') {
                            saveUndo();
                            track.notes.splice(idx, 1);
                            if (state.selectedNoteIndex >= track.notes.length) state.selectedNoteIndex = -1;
                            updateComposerUI();
                        }
                    });
                });
            }
        }

        const jsonArea = document.getElementById('ep-json-area');
        if (jsonArea) {
            updateEditingSongFromUI();
            jsonArea.value = JSON.stringify(state.editingSong, null, 2);
        }
    }

    function showEditPanel(index) {
        state.selectedNoteIndex = index;
        const track = getCurrentTrack();
        const note = track?.notes[index];
        if (!note) return;

        const panel = document.getElementById('ep-edit-panel');
        panel?.classList.add('active');

        const notesInput = document.getElementById('ep-edit-notes');
        const durationInput = document.getElementById('ep-edit-duration');
        const velocityInput = document.getElementById('ep-edit-velocity');
        const instrumentInput = document.getElementById('ep-edit-instrument');

        if (note.pedal !== undefined) {
            if (notesInput) notesInput.value = 'pedal';
            if (durationInput) durationInput.value = note.pedal;
            if (velocityInput) velocityInput.value = 80;
            if (instrumentInput) instrumentInput.value = '';
        } else if (note.rest) {
            if (notesInput) notesInput.value = '休符';
            if (durationInput) durationInput.value = note.rest;
            if (velocityInput) velocityInput.value = 80;
            if (instrumentInput) instrumentInput.value = '';
        } else if (note.notes) {
            if (notesInput) notesInput.value = note.notes.map(n => typeof n === 'string' ? n : n.note).join(',');
            if (durationInput) durationInput.value = note.duration;
            if (velocityInput) velocityInput.value = note.velocity || 80;
            if (instrumentInput) instrumentInput.value = note.instrument || '';
        } else if (note.note) {
            if (notesInput) notesInput.value = note.note;
            if (durationInput) durationInput.value = note.duration;
            if (velocityInput) velocityInput.value = note.velocity || 80;
            if (instrumentInput) instrumentInput.value = note.instrument || '';
        }

        updateComposerUI();
    }

    function hideEditPanel() {
        document.getElementById('ep-edit-panel')?.classList.remove('active');
        state.selectedNoteIndex = -1;
        updateComposerUI();
    }

    function showModal(mode, song = null) {
        const modal = document.getElementById('ep-modal');
        const title = document.getElementById('ep-modal-title');
        const textarea = document.getElementById('ep-modal-textarea');
        const confirmBtn = document.getElementById('ep-modal-confirm');

        if (mode === 'import') {
            if (title) title.textContent = '曲をインポート';
            if (textarea) { textarea.value = ''; textarea.readOnly = false; }
            if (confirmBtn) {
                confirmBtn.textContent = 'インポート';
                confirmBtn.onclick = () => {
                    try {
                        const data = JSON.parse(textarea?.value || '{}');
                        addSong(data);
                        updateSongList();
                        hideModal();
                        showToast('インポートしました');
                    } catch (e) {
                        showToast('JSON解析エラー');
                    }
                };
            }
        } else {
            if (title) title.textContent = '曲をエクスポート';
            if (textarea) { textarea.value = JSON.stringify(song, null, 2); textarea.readOnly = true; }
            if (confirmBtn) {
                confirmBtn.textContent = 'コピー';
                confirmBtn.onclick = () => {
                    navigator.clipboard.writeText(textarea?.value || '').then(() => {
                        showToast('コピーしました');
                        hideModal();
                    }).catch(() => {
                        textarea?.select();
                        document.execCommand('copy');
                        showToast('コピーしました');
                        hideModal();
                    });
                };
            }
        }

        modal?.classList.remove('hidden');
    }

    function hideModal() {
        document.getElementById('ep-modal')?.classList.add('hidden');
    }

    function init() {
        loadSongs();
        loadConfig();
        createUI();
        playbackController = new PlaybackController();
        connectWebSocket();
        log('Piano Player Pro v4.2 起動');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 500);
    }

    window.EpianoPlayer = {
        play: (song, startBeat = 0, trackIndices = null) => connectWebSocket().then(() => playbackController.play(song, startBeat, trackIndices)),
        stop: () => playbackController.stop(),
        pause: () => playbackController.pause(),
        addSong,
        getSongs: () => state.songs,
        getSong,
        deleteSong,
        INSTRUMENTS,
        sendPedal,
        downloadFile,
        openFileDialog
    };

})();
