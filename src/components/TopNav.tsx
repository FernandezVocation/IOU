import { NavLink } from 'react-router-dom'

const icons = {
  trips: <svg className="i" viewBox="0 0 24 24"><path d="M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4" /></svg>,
  overview: <svg className="i" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
}

/** Bottom navigation for the screens that are not inside a single trip. */
export default function TopNav() {
  return (
    <nav className="tabs" aria-label="Main">
      <div className="in two">
        <NavLink to="/" end>{icons.trips}<span>Groups</span></NavLink>
        <NavLink to="/overview">{icons.overview}<span>Overview</span></NavLink>
      </div>
    </nav>
  )
}
