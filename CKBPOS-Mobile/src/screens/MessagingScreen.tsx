import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { t } from '../i18n';
import { dbAll, dbRun, getSetting } from '../db/sqlite';
import { useAuthStore } from '../stores/authStore';
import { Ionicons } from '@expo/vector-icons';

interface Message {
  id: number;
  from_machine: string;
  from_label: string;
  from_user_nom: string;
  to_machine: string;
  content: string;
  msg_type: string;
  ts: string;
  read_at: string | null;
}

export default function MessagingScreen() {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [myMachineId, setMyMachineId] = useState('');
  const [myLabel, setMyLabel] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadMachineInfo();
    loadMessages();
  }, []);

  const loadMachineInfo = async () => {
    const mid = await getSetting('machine_id');
    const mlabel = await getSetting('machine_label');
    setMyMachineId(mid || '');
    setMyLabel(mlabel || 'Cette machine');
  };

  const loadMessages = async () => {
    const data = await dbAll<Message>(
      `SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 100`
    );
    setMessages(data.reverse());
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput('');

    try {
      await dbRun(
        `INSERT INTO chat_messages (from_machine, from_label, from_user_nom, to_machine, content, msg_type, created_at)
         VALUES (?, ?, ?, 'all', ?, 'text', datetime('now','utc'))`,
        [myMachineId, myLabel, user?.nom || '', content]
      );
      loadMessages();
    } catch (e) {
      console.error('[CHAT] Send error:', e);
    }
    setSending(false);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.from_machine === myMachineId;
    const isSystem = item.from_machine === 'system';

    if (isSystem) {
      return (
        <View style={styles.systemMessage}>
          <Text style={styles.systemText}>{item.content}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.messageRow, isMine && styles.messageRowMine]}>
        {!isMine && (
          <Text style={styles.senderLabel}>{item.from_user_nom || item.from_label}</Text>
        )}
        <View style={[styles.messageBubble, isMine && styles.messageBubbleMine]}>
          <Text style={[styles.messageText, isMine && styles.messageTextMine]}>{item.content}</Text>
        </View>
        <Text style={[styles.messageTime, isMine && styles.messageTimeMine]}>
          {item.ts ? new Date(item.ts.replace(' ', 'T') + 'Z').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => String(item.id)}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>{t('messaging.noMessages')}</Text>
          </View>
        }
      />

      {/* Input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder={t('messaging.placeholder')}
          placeholderTextColor={COLORS.textMuted}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
        >
          <Ionicons name="send" size={18} color={input.trim() ? '#000' : COLORS.textMuted} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  messageList: { padding: SPACING.md, paddingBottom: SPACING.sm },
  messageRow: { marginBottom: SPACING.sm, alignItems: 'flex-start' },
  messageRowMine: { alignItems: 'flex-end' },
  senderLabel: { fontSize: 10, color: COLORS.textMuted, marginBottom: 2, marginLeft: 4, fontWeight: '600' },
  messageBubble: { maxWidth: '75%', padding: SPACING.sm, borderRadius: 16, borderBottomLeftRadius: 4, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  messageBubbleMine: { borderBottomLeftRadius: 16, borderBottomRightRadius: 4, backgroundColor: COLORS.primary, borderWidth: 0 },
  messageText: { fontSize: 13, color: COLORS.text, lineHeight: 18 },
  messageTextMine: { color: '#000' },
  messageTime: { fontSize: 10, color: COLORS.textMuted, marginTop: 2, marginLeft: 4 },
  messageTimeMine: { marginRight: 4, marginLeft: 0 },
  systemMessage: { alignItems: 'center', padding: SPACING.xs },
  systemText: { fontSize: 11, color: COLORS.textMuted, backgroundColor: COLORS.surfaceLight, paddingHorizontal: SPACING.md, paddingVertical: 2, borderRadius: 10 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  emptyText: { color: COLORS.textMuted, marginTop: SPACING.md, fontSize: 14 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface, gap: SPACING.sm },
  textInput: { flex: 1, backgroundColor: COLORS.input, color: COLORS.text, borderRadius: 20, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: 14, maxHeight: 96, borderWidth: 1, borderColor: COLORS.border },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: COLORS.surfaceLight },
});
