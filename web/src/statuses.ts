import type { Status } from './api';
import type { IconName } from './components/ui';

export const STATUS: { key: Status; label: string; short: string; icon: IconName; color: string }[] = [
  { key: 'muhlat', label: 'Muhlat bergan', short: 'Muhlat', icon: 'clock', color: '#5B9BFF' },
  { key: 'boglanmadi', label: "Bog'lanib bo'lmadi", short: "Bog'lanmadi", icon: 'phoneOff', color: '#FF9F5A' },
  { key: 'uchinchi', label: 'Uchinchi shaxs', short: '3-shaxs', icon: 'userPlus', color: '#A78BFA' },
  { key: 'telegram', label: "Telegramdan bog'landim", short: 'Telegram', icon: 'send', color: '#39D0E0' },
  { key: 'sms', label: 'SMS xabarnoma', short: 'SMS', icon: 'message', color: '#7DD3FC' },
  { key: 'muammoli', label: 'Muammoli', short: 'Muammoli', icon: 'alert', color: '#FF6B7A' },
  { key: 'tolandi', label: "To'landi", short: "To'landi", icon: 'checkCircle', color: '#3DDC97' },
];

export const STATUS_BY_KEY = Object.fromEntries(STATUS.map((s) => [s.key, s])) as Record<Status, (typeof STATUS)[number]>;
