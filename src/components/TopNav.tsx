import { NavLink } from 'react-router-dom'

const icons = {
  trips: <svg className="i" viewBox="0 0 24 24"><path d="M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4" /></svg>,
  vaults: <svg className="i" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 10h18M9 14h6" /></svg>,
  itineraries: <svg className="i" viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" /></svg>,
  diary: <svg className="i" viewBox="0 0 24 24"><path d="M6 3h11a2 2 0 0 1 2 2v16H8a2 2 0 0 1-2-2V3zM6 17h13M10 8h5" /></svg>,
  overview: <svg className="i" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
}

/** Bottom navigation for the screens that are not inside a single trip. */
export default function TopNav() {
  return (
    <nav className="tabs" aria-label="Main">
      <div className="in five">
        <NavLink to="/" end>{icons.trips}<span>Groups</span></NavLink>
        <NavLink to="/vaults">{icons.vaults}<span>Vaults</span></NavLink>
        <NavLink to="/itineraries">{icons.itineraries}<span>Itineraries</span></NavLink>
        <NavLink to="/diary">{icons.diary}<span>Diary</span></NavLink>
        <NavLink to="/overview">{icons.overview}<span>Overview</span></NavLink>
      </div>
    </nav>
  )
}
