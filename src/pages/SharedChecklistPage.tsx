import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { dueText, statusLabel, typeLabel, type ChecklistItem } from '../lib/checklist'
import { Spinner } from '../components/ui'
import ChecklistTypeIcon from '../components/ChecklistTypeIcon'
import GroupIcon from '../components/GroupIcon'

interface Shared {
  checklist: { name: string; icon: string | null; color: string | null }
  label: string; include_notes: boolean
  items: Array<Pick<ChecklistItem, 'id' | 'type' | 'type_label' | 'type_icon' | 'title' | 'notes' | 'status' | 'due_on' | 'assigned_name' | 'completed_by_name' | 'qty' | 'packed_in'>>
}

/** A read-only list for someone without an account. Nothing here can be changed. */
export default function SharedChecklistPage() {
  const { token = '' } = useParams()
  const [data, setData] = useState<Shared | null | undefined>(undefined)
  useEffect(() => {
    supabase.rpc('get_shared_checklist', { p_token: token }).then(({ data, error }) => setData(error ? null : (data as Shared | null)))
  }, [token])
  if (data === undefined) return <Spinner />
  if (!data) return <div className="app"><div className="empty"><b>This link isn’t working</b>It may have been turned off or it has expired. Ask the person who sent it for a new one.</div></div>
  const done = data.items.filter(i => i.status === 'completed').length
  return (
    <div className="app">
      <div className="top wrapped">
        <div className="ck-title-row">
          <GroupIcon group={{ kind: 'Checklist', icon: data.checklist.icon, color: data.checklist.color }} size={40} />
          <div><h1>{data.checklist.name}</h1><div className="sub">{done} of {data.items.length} done · read-only</div></div>
        </div>
      </div>
      <div className="ck-list">
        {data.items.map(i => {
          const full = { ...i, type: i.type, type_label: i.type_label }
          return (
            <div className={'ck-row' + (i.status === 'completed' ? ' done' : '')} key={i.id}>
              <span className={'ck-tick ' + i.status} aria-label={statusLabel(i.status)}>{i.status === 'completed' ? '✓' : i.status === 'in_progress' ? '◐' : ''}</span>
              <div className="ck-main static">
                <span className="ck-title"><ChecklistTypeIcon type={i.type} icon={i.type_icon} />{i.title}{i.qty > 1 && <span className="muted"> ×{i.qty}</span>}</span>
                <span className="ck-meta">
                  <span className="ck-chip">{typeLabel(full)}</span>
                  {i.due_on && <span className="ck-chip">{dueText(i.due_on)}</span>}
                  {i.assigned_name && <span className="ck-chip">{i.assigned_name}</span>}
                  {i.packed_in && <span className="ck-chip">in {i.packed_in}</span>}
                  {i.status === 'completed' && i.completed_by_name && <span className="ck-chip ok">Done by {i.completed_by_name}</span>}
                </span>
                {data.include_notes && i.notes && <span className="muted small">{i.notes}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
