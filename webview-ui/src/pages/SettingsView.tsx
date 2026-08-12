import { useEffect, useState } from 'react';
import { AlertCircle, ExternalLink, Search, Server, SlidersHorizontal } from 'lucide-react';
import type { EditableSetting, ProviderSummary } from '../../../shared/protocol';
import { runCommand } from '../api/host';
import { useSettings, useUpdateSetting } from '../hooks/useSettings';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Separator } from '../components/ui/separator';
import { Switch } from '../components/ui/switch';

/**
 * Everything about how this extension behaves, in the dashboard rather than in
 * VS Code's settings editor.
 *
 * The AI providers are the exception and stay in their own panel: they are a
 * list of endpoints that has to be discovered, tested and reordered, which is
 * more UI than a settings row can hold. This page links to it, shows the try
 * order it produced, and owns everything else.
 */

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

/**
 * A text or number field that writes when it is left, not on every keystroke -
 * a settings write per character would fight the user's typing and thrash
 * settings.json.
 */
function CommittedInput({
  value,
  onCommit,
  type = 'text',
  className,
  placeholder,
}: {
  value: string | number;
  onCommit: (value: string) => void;
  type?: 'text' | 'number';
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(String(value));

  // Re-syncs when the host answers with a different value than was typed.
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <Input
      type={type}
      value={draft}
      placeholder={placeholder}
      className={className}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== String(value)) {
          onCommit(draft);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function ProviderRow({ provider, index }: { provider: ProviderSummary; index: number }) {
  return (
    <div className="flex items-center gap-3 py-1.5 text-sm">
      <span className="w-5 shrink-0 tabular-nums text-muted-foreground">
        {provider.included ? `${index + 1}.` : '—'}
      </span>
      <span className="min-w-0 flex-1 truncate">{provider.label}</span>
      {provider.kind === 'custom' && <Badge variant="secondary">custom</Badge>}
      {provider.included && provider.enabled === false && <Badge variant="outline">disabled</Badge>}
      {!provider.included && <Badge variant="outline">never tried</Badge>}
    </div>
  );
}

export function SettingsView() {
  const { data: settings, isLoading, error } = useSettings();
  const update = useUpdateSetting();

  const set = (key: EditableSetting, value: unknown) => update.mutate({ key, value });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Reading settings…</p>;
  }

  if (error || !settings) {
    return (
      <div className="flex items-start gap-2 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Could not read the extension settings: {error?.message ?? 'no answer from the editor'}</span>
      </div>
    );
  }

  const ordered = settings.providers.filter((provider) => provider.included);
  const excluded = settings.providers.filter((provider) => !provider.included);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          These are the extension's own settings. Every change here is written straight to VS Code's
          settings, so it survives a reload and can also be edited there.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-4 w-4" /> AI providers
          </CardTitle>
          <CardDescription>
            Tried top to bottom; the first available one annotates the document. Endpoints and their
            order are edited in the AI models panel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border px-3 py-2">
            {ordered.length === 0 && (
              <p className="py-1.5 text-sm text-muted-foreground">No provider is in the try order.</p>
            )}
            {ordered.map((provider, index) => (
              <ProviderRow key={provider.token} provider={provider} index={index} />
            ))}
            {excluded.length > 0 && (
              <>
                <Separator className="my-2" />
                {excluded.map((provider, index) => (
                  <ProviderRow key={provider.token} provider={provider} index={index} />
                ))}
              </>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void runCommand('speckitStandalone.manageProviders')}>
              <SlidersHorizontal /> Manage AI providers
            </Button>
            <Button variant="outline" onClick={() => void runCommand('speckitStandalone.discoverModels')}>
              <Search /> Discover models
            </Button>
            <span className="self-center text-sm text-muted-foreground">
              {settings.customModelCount} custom endpoint{settings.customModelCount === 1 ? '' : 's'} configured
            </span>
          </div>

          <Separator className="my-4" />

          <SettingRow
            title="Use AI to annotate documents"
            description="Adds a summary, a glossary and diagrams. Every claim is checked against your document before it is printed."
          >
            <Switch
              checked={settings.enrich}
              onCheckedChange={(checked) => set('enrich', checked)}
              aria-label="Use AI to annotate documents"
            />
          </SettingRow>

          <SettingRow
            title="Build a plain PDF when no AI is available"
            description="Off by default, so a missing provider is noticed rather than silently producing a document with no glossary or diagrams."
          >
            <Switch
              checked={settings.allowRuleBasedFallback}
              onCheckedChange={(checked) => set('allowRuleBasedFallback', checked)}
              aria-label="Build a plain PDF when no AI is available"
            />
          </SettingRow>

          <SettingRow
            title="Preferred model"
            description="Matched against the id, family or name of the editor's own models. If it matches, that model is tried first."
          >
            <CommittedInput
              value={settings.preferredModelId}
              placeholder="gpt-4o"
              className="w-48"
              onCommit={(value) => set('preferredModelId', value)}
            />
          </SettingRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conversion</CardTitle>
          <CardDescription>When documents are converted, and how many at a time.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow
            title="Convert on save"
            description="Stored for this workspace, not globally - whether a project rebuilds its PDFs is a property of the project."
          >
            <Switch
              checked={settings.convertOnSave}
              onCheckedChange={(checked) => set('convertOnSave', checked)}
              aria-label="Convert on save"
            />
          </SettingRow>

          <SettingRow
            title="Auto-processing"
            description="The global gate for save-triggered processing. Per-project automation is the Auto transform switch in the sidebar."
          >
            <Switch
              checked={settings.autoProcess}
              onCheckedChange={(checked) => set('autoProcess', checked)}
              aria-label="Auto-processing"
            />
          </SettingRow>

          <SettingRow title="Debounce" description="How long to wait after a save before converting (ms).">
            <CommittedInput
              type="number"
              value={settings.debounceMs}
              className="w-28"
              onCommit={(value) => set('debounceMs', Number(value))}
            />
          </SettingRow>

          <SettingRow title="Concurrent conversions" description="How many files are converted at once.">
            <CommittedInput
              type="number"
              value={settings.maxConcurrentProcessing}
              className="w-28"
              onCommit={(value) => set('maxConcurrentProcessing', Number(value))}
            />
          </SettingRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diagnostics</CardTitle>
          <CardDescription>The backend is a child process of this editor window.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow title="Verbose logging" description="Writes every step to the Speckit output channel.">
            <Switch
              checked={settings.enableDebugLogging}
              onCheckedChange={(checked) => set('enableDebugLogging', checked)}
              aria-label="Verbose logging"
            />
          </SettingRow>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void runCommand('speckitStandalone.checkBackendStatus')}>
              Check backend status
            </Button>
            <Button variant="outline" onClick={() => void runCommand('speckitStandalone.showLogs')}>
              Show logs
            </Button>
            <Button variant="outline" onClick={() => void runCommand('speckitStandalone.stopProcessing')}>
              Stop processing
            </Button>
            <Button variant="ghost" onClick={() => void runCommand('speckitStandalone.openNativeSettings')}>
              <ExternalLink /> Open in VS Code settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SettingsView;
