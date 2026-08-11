import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { useSetArtifactTags } from '../hooks/useArtifacts';

interface ArtifactTagsProps {
  artifactId: string;
  projectId: string;
  tags: string[];
}

/**
 * Free-form tags for organizing artifacts beyond the fixed artifact_type
 * categories. Lives inside ArtifactCard, which is itself a clickable
 * "open this artifact" surface, so every interactive element here stops
 * its own click/keydown from bubbling up - otherwise adding/removing a tag
 * would also navigate away from the card. Propagation is stopped on each
 * interactive element individually (not a wrapping div) so nothing here
 * gains click/keydown handling without also being a real, focusable,
 * native interactive element (button/input).
 */
export function ArtifactTags({ artifactId, projectId, tags }: ArtifactTagsProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const { mutate: setTags } = useSetArtifactTags(projectId);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input once it appears (triggered by the user's own click on
  // "Add tag" below) - done imperatively via a ref rather than the
  // `autoFocus` prop, which unconditionally steals focus on mount
  // regardless of whether the user actually asked for this input to open.
  useEffect(() => {
    if (adding) {
      inputRef.current?.focus();
    }
  }, [adding]);

  const commitAdd = () => {
    const value = draft.trim();
    setDraft('');
    setAdding(false);
    if (!value || tags.includes(value)) {
      return;
    }
    setTags({ artifactId, tags: [...tags, value] });
  };

  const removeTag = (tag: string) => {
    setTags({ artifactId, tags: tags.filter((t) => t !== tag) });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1 font-normal">
          {tag}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              removeTag(tag);
            }}
            aria-label={`Remove tag ${tag}`}
            className="rounded-full p-0.5 hover:bg-muted-foreground/20"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {adding ? (
        <Input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              commitAdd();
            } else if (event.key === 'Escape') {
              setDraft('');
              setAdding(false);
            }
          }}
          onBlur={commitAdd}
          placeholder="New tag"
          aria-label="New tag"
          className="h-6 w-24 px-2 text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setAdding(true);
          }}
          aria-label="Add tag"
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          Tag
        </button>
      )}
    </div>
  );
}
