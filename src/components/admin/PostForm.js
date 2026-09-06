'use client';

import { useActionState, useState } from 'react';
import { savePost } from '@/lib/actions/admin';
import { CAR_IMAGES, LOCALES } from '@/lib/constants';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Card, LOCALE_LABEL, Notice, SubmitButton } from '@/components/admin/ui';
import { cn } from '@/lib/cn';

export default function PostForm({ post = {}, saved = false }) {
  const [state, action, pending] = useActionState(savePost, null);
  const [lang, setLang] = useState('fr');
  const p = post;
  return (
    <form action={action} className="space-y-5">
      {saved ? <Notice>Article enregistré.</Notice> : null}
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <input type="hidden" name="id" value={p.id || ''} />
      <Card title="Publication">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Slug (URL)" htmlFor="slug" hint="vide = auto" className="sm:col-span-2">
            <Input id="slug" name="slug" defaultValue={p.slug} className="font-latin-sans" />
          </Field>
          <Field label="Illustration" htmlFor="cover">
            <Select id="cover" name="cover" defaultValue={p.cover || 'berline'}>
              {CAR_IMAGES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date de publication" htmlFor="publishedAt">
            <Input id="publishedAt" name="publishedAt" type="date" defaultValue={(p.publishedAt || new Date().toISOString()).slice(0, 10)} />
          </Field>
          <Field label="Tags (virgules)" htmlFor="tags" className="sm:col-span-3">
            <Input id="tags" name="tags" defaultValue={(p.tags || []).join(', ')} className="font-latin-sans" />
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox id="published" name="published" defaultChecked={Boolean(p.published)} label="Publié" />
          </div>
        </div>
      </Card>

      <Card title="Contenu">
        <div className="mb-4 flex gap-1 rounded-full bg-surface-2 p-1">
          {LOCALES.map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} className={cn('rounded-full px-4 py-1.5 text-xs font-semibold', lang === l ? 'bg-surface-1 text-text shadow-card' : 'text-text-muted')}>
              {LOCALE_LABEL[l]}
            </button>
          ))}
        </div>
        {LOCALES.map((l) => (
          <div key={l} className={cn('space-y-4', lang !== l && 'hidden')} dir={l === 'ar' ? 'rtl' : 'ltr'}>
            <Field label="Titre" htmlFor={`title_${l}`}>
              <Input id={`title_${l}`} name={`title_${l}`} defaultValue={p.title?.[l] || ''} required={l === 'fr'} />
            </Field>
            <Field label="Extrait (2 phrases, réponse directe)" htmlFor={`excerpt_${l}`}>
              <Textarea id={`excerpt_${l}`} name={`excerpt_${l}`} defaultValue={p.excerpt?.[l] || ''} className="min-h-20" />
            </Field>
            <Field label="Corps (Markdown : ## titres, - listes, **gras**)" htmlFor={`body_${l}`}>
              <Textarea id={`body_${l}`} name={`body_${l}`} defaultValue={p.body?.[l] || ''} className="min-h-[28rem] font-latin-sans text-sm" />
            </Field>
          </div>
        ))}
      </Card>
      <div className="flex justify-end">
        <SubmitButton disabled={pending}>{pending ? 'Enregistrement…' : 'Enregistrer'}</SubmitButton>
      </div>
    </form>
  );
}
