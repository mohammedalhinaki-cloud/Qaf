import { ChatShell } from '@/components/ChatShell';
import { devFixturesEnabled } from '@/lib/dev/fixtures';

export default function Page() {
  // يُحسب على الخادم؛ في الإنتاج يكون false دائمًا.
  return <ChatShell devFixtures={devFixturesEnabled()} />;
}
