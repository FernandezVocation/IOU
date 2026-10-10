import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

/** Signed (temporary) links for private receipt files, fetched in batches. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (let i = 0; i < paths.length; i += 100) {
    const { data } = await supabase.storage.from('receipts').createSignedUrls(paths.slice(i, i + 100), 3600)
    for (const x of data ?? []) if (x.path && x.signedUrl) out[x.path] = x.signedUrl
  }
  return out
}

export function useSignedUrls(paths: string[]): Record<string, string> {
  const key = useMemo(() => [...new Set(paths)].sort().join('|'), [paths])
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!key) { setUrls({}); return }
    let alive = true
    signedUrls(key.split('|')).then(u => { if (alive) setUrls(u) })
    return () => { alive = false }
  }, [key])
  return urls
}

export async function downloadReceiptBlob(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from('receipts').download(path)
  if (error || !data) throw error ?? new Error('Download failed')
  return data
}
