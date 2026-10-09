import { Link } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import { useGroup } from './GroupShell'

/** Everything that doesn't need its own tab on a phone. */
export default function MoreTab() {
  const { data } = useGroup()
  const base = '/g/' + data.group.id
  return (
    <div>
      <div className="sect" style={{ marginTop: 6 }}>
        <Link className="moreitem" to={base + '/reports'}><span><b>Reports and invoices</b><span className="sub">Excel and PDF reports, itemized invoices</span></span><span aria-hidden>›</span></Link>
        <Link className="moreitem" to={base + '/settings'}><span><b>Group settings</b><span className="sub">People, invite link, balance links, currency, rates</span></span><span aria-hidden>›</span></Link>
        <Link className="moreitem" to="/overview"><span><b>Overview across groups</b><span className="sub">Who owes what in all your groups</span></span><span aria-hidden>›</span></Link>
      </div>
      <div className="panel"><ThemeToggle /></div>
    </div>
  )
}
