import React from 'react';

import { InfoSheet, type InfoContent } from '@/components/info-sheet';

/**
 * Zero data retention, in plain words. The brain is software on the
 * provider's machines and "kept" is the promise, so the copy never says
 * anyone "reads" a message: that reads as a person. Every call Samwell Cloud
 * makes asks OpenRouter for zero-retention endpoints only, and is refused
 * rather than sent anywhere else (`server/src/openrouter.ts`); the server keeps usage,
 * never words. Web search is the one thing outside it: the search engine sees
 * the query, under its own policy, which OpenRouter's own docs call out.
 * Change this only alongside the server.
 */
const ZERO_RETENTION: InfoContent = {
  label: 'SAMWELL CLOUD',
  title: 'Nothing you say is kept',
  line: 'Samwell Cloud only uses brains with zero data retention.',
  points: [
    'Your message goes to the brain, which works out the answer, and then it is gone. On the way it passes through our server and OpenRouter, and neither keeps it.',
    'Nothing is stored, not even for a day, so there is nothing for any person to read later.',
    'And nothing you say can be used to train an AI.',
    'If a brain cannot promise this, Samwell does not use it.',
    'Our server keeps only how many Neurons a message used. Your chats are saved on this phone.',
  ],
  notice: {
    title: 'Web searches',
    body: 'When Samwell searches the web, the search engine sees the words he searched for and keeps them under its own rules. Your conversation is not sent to it.',
  },
};

export interface PrivacySheetProps {
  visible: boolean;
  onClose: () => void;
}

/** What the green shield on a cloud reply opens (`PrivacyButton`). One per conversation. */
export function PrivacySheet({ visible, onClose }: PrivacySheetProps) {
  return <InfoSheet visible={visible} onClose={onClose} info={ZERO_RETENTION} />;
}
