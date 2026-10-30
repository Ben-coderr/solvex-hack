import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Btn, Screen } from '@/src/components/kit';
import { EmptyState } from '@/src/ui';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <Screen>
      <EmptyState />
      <Btn label={t('common.back')} kind="secondary" onPress={() => router.replace('/')} />
    </Screen>
  );
}
