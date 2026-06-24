import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../App';
import { useLang } from '../utils/useLang';
import { Send, Radio, Mic, MicOff, Play, Pause, Square, Trash2 } from 'lucide-react';

const SYSTEM_MSG_RE = /^__system__:(connected|disconnected|disconnectedMsg):(.+)$/;

function parseSystemMsg(content, t) {
  const m = content.match(SYSTEM_MSG_RE);
  if (!m) return null;
  const verb = m[1] === 'connected' ? (t('messaging','connected')||'connecté') : (t('messaging','disconnectedMsg')||'déconnecté');
  return `${m[2]} ${verb}`;
}

function fmtTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts.replace(' ','T')+'Z');
    const diffH = (Date.now() - d) / 3600000;
    if (diffH < 24) return d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    return d.toLocaleDateString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
  } catch(_e) { return ''; }
}

// Lecteur audio inline
function AudioPlayer({ audioData }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);
  const blobUrlRef = useRef(null);

  useEffect(() => {
    if (!audioData) return;
    // Essayer plusieurs formats
    const mimeTypes = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg','audio/mp4'];
    let mimeType = 'audio/webm';
    for (const m of mimeTypes) {
      const a = document.createElement('audio');
      if (a.canPlayType(m) !== '') { mimeType = m; break; }
    }
    try {
      const bytes = atob(audioData);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: mimeType });
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.addEventListener('loadedmetadata', () => setDuration(audio.duration || 0));
      audio.addEventListener('ended', () => { setPlaying(false); setProgress(0); });
      audio.addEventListener('timeupdate', () => {
        if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
      });
    } catch(e) { console.error('[AudioPlayer]', e); }
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    };
  }, [audioData]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play().then(() => setPlaying(true)).catch(e => console.error('[AudioPlay]', e)); }
  };

  const fmtDur = (s) => isNaN(s)||!s ? '—' : `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:180 }}>
      <button onClick={toggle}
        style={{ width:32, height:32, borderRadius:'50%', border:'none', background:'rgba(0,0,0,0.2)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        {playing ? <Pause size={13}/> : <Play size={13}/>}
      </button>
      <div style={{ flex:1 }}>
        <div style={{ height:4, background:'rgba(0,0,0,0.15)', borderRadius:2, overflow:'hidden', marginBottom:2 }}>
          <div style={{ height:'100%', width:progress+'%', background:'currentColor', borderRadius:2, transition:'width 0.1s' }}/>
        </div>
        <span style={{ fontSize:9, opacity:0.7 }}>{'\u{1F3A4}'} {fmtDur(duration)}</span>
      </div>
    </div>
  );
}

export default function MessagingPage() {
  const { user } = useAuth();
  const { t } = useLang();

  const [peers, setPeers] = useState([]);
  const [activePeer, setActivePeer] = useState('all');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [myMachineId, setMyMachineId] = useState('');
  const [myLabel, setMyLabel] = useState('');

  // Audio recording
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // { type:'message'|'conversation', target, scope }

  useEffect(() => {
    window.electron.getMachineId().then(r => {
      if (r?.success) { setMyMachineId(r.machine_id); setMyLabel(r.machine_label || 'Cette machine'); }
    }).catch(()=>{});
  }, []);

  const loadPeers = useCallback(() => {
    window.electron.networkPeersList().then(r => {
      if (r?.success) setPeers(r.data || []);
    }).catch(()=>{});
  }, []);

  useEffect(() => {
    loadPeers();
    const cleanup = window.electron.onNetworkPeersUpdate((data) => setPeers(data || []));
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, [loadPeers]);

  const loadHistory = useCallback(() => {
    window.electron.chatHistory({ to: activePeer === 'all' ? 'all' : activePeer, limit: 150 })
      .then(r => {
        if (r?.success) {
          setMessages(r.data || []);
          const unreadIds = (r.data||[]).filter(m => m.from_machine !== myMachineId && !m.read_at).map(m => m.id);
          if (unreadIds.length) window.electron.chatMarkRead({ ids: unreadIds }).catch(()=>{});
        }
      }).catch(()=>{});
  }, [activePeer, myMachineId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    const cleanup = window.electron.onChatMessage((msg) => {
      const relevant = msg.to === 'all' || msg.to === myMachineId || msg.from === myMachineId ||
        (activePeer !== 'all' && (msg.from === activePeer || msg.to === activePeer));
      if (relevant) {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.from_machine === msg.from && last.content === msg.content && last.ts === msg.ts) return prev;
          return [...prev, {
            id: Date.now(), from_machine: msg.from, from_label: msg.fromLabel,
            from_user_nom: msg.fromUserNom, to_machine: msg.to, content: msg.content,
            msg_type: msg.msgType || 'text', audio_data: msg.audioData || null,
            ts: msg.ts, read_at: msg.from === myMachineId ? 'local' : null,
          }];
        });
        if (msg.from !== myMachineId) window.electron.chatMarkRead({ ids: [] }).catch(()=>{});
      }
    });
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, [activePeer, myMachineId]);

  useEffect(() => {
    const cleanup1 = window.electron.onChatDeleted(({ clientId }) => {
      if (!clientId) return;
      setMessages(prev => prev.filter(m => m.client_id !== clientId));
    });
    const cleanup2 = window.electron.onChatConvDeleted(({ peerId }) => {
      setMessages(prev => prev.filter(m =>
        !((m.from_machine === peerId && m.to_machine === myMachineId) ||
          (m.from_machine === myMachineId && m.to_machine === peerId))
      ));
    });
    return () => {
      if (typeof cleanup1 === 'function') cleanup1();
      if (typeof cleanup2 === 'function') cleanup2();
    };
  }, [myMachineId]);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput('');
    try {
      await window.electron.chatSend({ to: activePeer === 'all' ? 'all' : activePeer, content, userNom: user?.nom || null, msgType: 'text' });
      loadHistory();
    } catch(_e) {}
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Suppression message / conversation (v4.10.0) ──────────
  const requestDeleteMessage = (msg) => {
    setConfirmDelete({ type: 'message', target: msg });
  };

  const requestDeleteConversation = (convId) => {
    setConfirmDelete({ type: 'conversation', target: convId });
  };

  const confirmDeleteAction = async (scope) => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.type === 'message') {
        const msg = confirmDelete.target;
        if (msg.client_id) {
          await window.electron.chatDeleteMessage({ client_id: msg.client_id, scope });
          setMessages(prev => prev.filter(m => m.client_id !== msg.client_id));
        }
      } else {
        const peerId = confirmDelete.target;
        await window.electron.chatDeleteConversation({ peerId, scope });
        if (peerId === 'all') {
          setMessages(prev => prev.filter(m => m.to_machine !== 'all'));
        } else {
          setMessages(prev => prev.filter(m =>
            !((m.from_machine === peerId && m.to_machine === myMachineId) ||
              (m.from_machine === myMachineId && m.to_machine === peerId))
          ));
        }
      }
    } catch(_e) {}
    setConfirmDelete(null);
  };

  // ── Enregistrement vocal ──────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg']
        .find(m => MediaRecorder.isTypeSupported(m)) || '';
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result.split(',')[1];
          setSending(true);
          try {
            await window.electron.chatSend({ to: activePeer === 'all' ? 'all' : activePeer, content: '[Message vocal]', userNom: user?.nom || null, msgType: 'audio', audioData: base64 });
            loadHistory();
          } catch(_e) {}
          setSending(false);
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordTime(0);
      recordTimerRef.current = setInterval(() => setRecordTime(t => t + 1), 1000);
    } catch(e) {
      alert('Microphone non disponible: ' + e.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      clearInterval(recordTimerRef.current);
      setRecording(false);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      clearInterval(recordTimerRef.current);
      setRecording(false);
      audioChunksRef.current = [];
    }
  };

  const fmtRecordTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  const conversations = [
    { id: 'all', label: t('messaging','broadcast') || 'Broadcast', isAll: true, online: true },
    ...peers.filter(p => p.machine_id !== myMachineId).map(p => ({
      id: p.machine_id, label: p.machine_label || p.machine_id?.slice(0,8),
      sublabel: p.ip || '—', online: p.status === 'online',
    })),
  ];

  const activeConv = conversations.find(c => c.id === activePeer) || conversations[0];

  const filteredMessages = messages.filter(m => {
    if (activePeer === 'all') return m.to_machine === 'all' || m.from_machine === 'system';
    return (
      m.to_machine === 'all' ||
      (m.from_machine === activePeer && (m.to_machine === myMachineId || m.to_machine === 'all')) ||
      (m.from_machine === myMachineId && m.to_machine === activePeer)
    );
  });

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden', background:'var(--bg-primary)' }}>

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <div style={{ width:240, flexShrink:0, background:'var(--bg-secondary)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
          <h2 style={{ fontSize:15, fontWeight:700, margin:0, display:'flex', alignItems:'center', gap:8 }}>
            <Radio size={16} color="var(--accent)" />
            {t('messaging','title') || 'Mensagens'}
          </h2>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:3 }}>
            {user?.nom && <span style={{ color:'var(--accent)', fontWeight:600 }}>{user.nom} · </span>}
            {myLabel || '—'}
          </div>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'8px 0' }}>
          {conversations.map(conv => (
            <div key={conv.id} className="group"
              style={{ display:'flex', alignItems:'center', width:'100%',
                background: activePeer===conv.id ? 'var(--accent-dim)' : 'transparent',
                borderLeft: activePeer===conv.id ? '3px solid var(--accent)' : '3px solid transparent' }}>
              <button onClick={() => setActivePeer(conv.id)}
                style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:10, padding:'10px 6px 10px 14px', border:'none', background:'none', cursor:'pointer', textAlign:'left' }}>
                <div style={{ width:36, height:36, borderRadius:'50%', flexShrink:0,
                  background: conv.isAll ? 'rgba(232,197,71,0.15)' : conv.online ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
                  border: `2px solid ${conv.isAll ? 'rgba(232,197,71,0.4)' : conv.online ? 'rgba(34,197,94,0.4)' : 'rgba(107,114,128,0.3)'}`,
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700,
                  color: conv.isAll ? '#e8c547' : conv.online ? '#22c55e' : '#6b7280' }}>
                  {conv.isAll ? '\u{1F4E2}' : conv.label[0]?.toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color: activePeer===conv.id ? 'var(--accent)' : 'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{conv.label}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:4 }}>
                    {!conv.isAll && (conv.online
                      ? <><span style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', display:'inline-block' }}/>{t('messaging','online')||'Online'}</>
                      : <><span style={{ width:6, height:6, borderRadius:'50%', background:'#6b7280', display:'inline-block' }}/>{t('messaging','offline')||'Offline'}</>
                    )}
                    {conv.isAll && <span style={{ color:'var(--accent)', fontWeight:600 }}>Broadcast</span>}
                  </div>
                </div>
              </button>
              <button onClick={() => requestDeleteConversation(conv.id)}
                title={t('messaging','deleteConversation') || 'Supprimer la conversation'}
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:'6px 10px', flexShrink:0 }}
                onMouseEnter={e => e.currentTarget.style.color='#ef4444'}
                onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}>
                <Trash2 size={13}/>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Zone messages ───────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--bg-secondary)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{ width:36, height:36, borderRadius:'50%', background: activeConv?.isAll ? 'rgba(232,197,71,0.15)' : 'rgba(34,197,94,0.1)', border:'2px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>
            {activeConv?.isAll ? '\u{1F4E2}' : activeConv?.label[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700 }}>{activeConv?.label || '—'}</div>
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>
              {activeConv?.isAll ? <span style={{ color:'#e8c547' }}>{'\u{1F4E2}'} {t('messaging','all')||'Toutes les machines'}</span>
                : activeConv?.online ? <><span style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', display:'inline-block', marginRight:4 }}/>{t('messaging','online')||'Online'}</>
                : <><span style={{ width:6, height:6, borderRadius:'50%', background:'#6b7280', display:'inline-block', marginRight:4 }}/>{t('messaging','offline')||'Offline'}</>}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:6 }}>
          {filteredMessages.length === 0 && (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:14 }}>
              {t('messaging','noMessages')||'Aucun message'}
            </div>
          )}

          {filteredMessages.map((msg, i) => {
            const isSystem = msg.from_machine === 'system';
            const isMine = msg.from_machine === myMachineId;
            const systemText = isSystem ? parseSystemMsg(msg.content, t) : null;
            const isAudio = msg.msg_type === 'audio';

            if (isSystem || systemText) {
              return (
                <div key={msg.id || i} style={{ textAlign:'center', padding:'4px 0' }}>
                  <span style={{ fontSize:11, color:'var(--text-muted)', background:'var(--bg-hover)', padding:'3px 10px', borderRadius:10 }}>
                    {systemText || msg.content}
                  </span>
                </div>
              );
            }

            // Afficher nom utilisateur + machine
            const senderLabel = msg.from_user_nom
              ? `${msg.from_user_nom} · ${msg.from_label || ''}`
              : (msg.from_label || msg.from_machine?.slice(0,8));

            return (
              <div key={msg.id || i} style={{ display:'flex', flexDirection:'column', alignItems: isMine ? 'flex-end' : 'flex-start', gap:2 }}>
                {!isMine && (
                  <span style={{ fontSize:10, color:'var(--text-muted)', marginLeft:4, fontWeight:600 }}>
                    {senderLabel}
                  </span>
                )}
                {isMine && msg.from_user_nom && (
                  <span style={{ fontSize:10, color:'var(--text-muted)', marginRight:4 }}>
                    {msg.from_user_nom}
                  </span>
                )}
                <div style={{ maxWidth:'65%', padding:'9px 14px', borderRadius: isMine ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                  background: isMine ? 'var(--accent)' : 'var(--bg-card)',
                  border: isMine ? 'none' : '1px solid var(--border)',
                  color: isMine ? '#000' : 'var(--text-primary)',
                  fontSize:13, lineHeight:1.5, wordBreak:'break-word' }}>
                  {isAudio && msg.audio_data ? (
                    <AudioPlayer audioData={msg.audio_data} />
                  ) : (
                    msg.content
                  )}
                </div>
                <span style={{ fontSize:10, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:6, marginLeft: isMine?0:4, marginRight: isMine?4:0 }}>
                  {fmtTime(msg.ts)}{isMine && msg.read_at && msg.read_at !== 'local' && ' \u2713\u2713'}
                  {msg.client_id && (
                    <button onClick={() => requestDeleteMessage(msg)}
                      title={t('messaging','deleteMessage') || 'Supprimer le message'}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0, display:'flex', alignItems:'center' }}
                      onMouseEnter={e => e.currentTarget.style.color='#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}>
                      <Trash2 size={10}/>
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Modale confirmation suppression */}
        {confirmDelete && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
            onClick={() => setConfirmDelete(null)}>
            <div onClick={e => e.stopPropagation()} className="card" style={{ padding:20, maxWidth:340, width:'90%' }}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>
                {confirmDelete.type === 'message'
                  ? (t('messaging','deleteMessageTitle') || 'Supprimer le message')
                  : (t('messaging','deleteConversationTitle') || 'Supprimer la conversation')}
              </div>
              <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:16 }}>
                {t('messaging','deleteConfirmDesc') || 'Choisissez comment supprimer.'}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <button onClick={() => confirmDeleteAction('local')} className="btn btn-secondary" style={{ fontSize:12, justifyContent:'center' }}>
                  {t('messaging','deleteForMe') || 'Supprimer pour moi'}
                </button>
                {(confirmDelete.type === 'conversation' ? confirmDelete.target !== 'all' : confirmDelete.target.from_machine === myMachineId) && (
                  <button onClick={() => confirmDeleteAction('all')} className="btn btn-danger" style={{ fontSize:12, justifyContent:'center' }}>
                    {t('messaging','deleteForEveryone') || 'Supprimer pour tous'}
                  </button>
                )}
                <button onClick={() => setConfirmDelete(null)} className="btn btn-secondary" style={{ fontSize:12, justifyContent:'center', opacity:0.7 }}>
                  {t('messaging','cancel') || 'Annuler'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Zone saisie */}
        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', background:'var(--bg-secondary)', flexShrink:0 }}>
          {/* Barre d'enregistrement active */}
          {recording && (
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10, padding:'8px 14px', borderRadius:10, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)' }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:'#ef4444', display:'inline-block', animation:'pulse 1s infinite' }}/>
              <span style={{ fontSize:13, fontWeight:600, color:'#ef4444', flex:1 }}>Enregistrement… {fmtRecordTime(recordTime)}</span>
              <button onClick={cancelRecording} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:12, padding:'2px 8px' }}>Annuler</button>
              <button onClick={stopRecording}
                style={{ padding:'6px 14px', borderRadius:8, border:'none', background:'#ef4444', color:'#fff', cursor:'pointer', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                <Square size={12}/> Envoyer
              </button>
            </div>
          )}

          <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder={t('messaging','placeholder')||'Écrire un message... (Entrée pour envoyer)'}
              rows={1} disabled={recording}
              style={{ flex:1, resize:'none', border:'1px solid var(--border)', borderRadius:12, padding:'10px 14px', fontSize:13, fontFamily:'inherit',
                background:'var(--bg-primary)', color:'var(--text-primary)', outline:'none', maxHeight:96, overflowY:'auto', lineHeight:1.5,
                opacity: recording ? 0.5 : 1 }}
              onInput={e => { e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,96)+'px'; }}
            />

            {/* Bouton micro */}
            <button onClick={recording ? stopRecording : startRecording} disabled={sending}
              style={{ width:40, height:40, borderRadius:'50%', border:'none', flexShrink:0,
                background: recording ? '#ef4444' : 'var(--bg-hover)',
                color: recording ? '#fff' : 'var(--text-muted)',
                cursor: sending ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.2s' }}>
              {recording ? <Square size={15}/> : <Mic size={15}/>}
            </button>

            {/* Bouton envoyer texte */}
            <button onClick={handleSend} disabled={!input.trim() || sending || recording}
              style={{ width:40, height:40, borderRadius:'50%', border:'none', flexShrink:0,
                background: input.trim() && !sending && !recording ? 'var(--accent)' : 'var(--bg-hover)',
                color: input.trim() && !sending && !recording ? '#000' : 'var(--text-muted)',
                cursor: input.trim() && !sending && !recording ? 'pointer' : 'not-allowed',
                display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.2s, color 0.2s' }}>
              <Send size={16}/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
