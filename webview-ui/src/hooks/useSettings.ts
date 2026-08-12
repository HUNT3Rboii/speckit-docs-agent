import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EditableSetting, SettingsSnapshot } from '../../../shared/protocol';
import { readSettings, updateSetting } from '../api/host';

/**
 * The extension's settings, as the dashboard's settings page shows them.
 *
 * No polling: settings only change from this page or from VS Code's own
 * settings editor, and the panel is reloaded when it is revealed anyway.
 */
export function useSettings() {
  return useQuery<SettingsSnapshot, Error>({
    queryKey: ['settings'],
    queryFn: readSettings,
    staleTime: 30 * 1000,
  });
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();

  return useMutation<SettingsSnapshot, Error, { key: EditableSetting; value: unknown }>({
    mutationFn: ({ key, value }) => updateSetting(key, value),
    // The host answers with the settings as they now stand, so the page shows
    // what was actually written rather than what was asked for.
    onSuccess: (snapshot) => queryClient.setQueryData(['settings'], snapshot),
  });
}
