const flagUrls = import.meta.glob(
  '../../../node_modules/country-flag-icons/3x2/*.svg',
  { eager: true, query: '?url', import: 'default' },
)

const flags = new Map(
  Object.entries(flagUrls).map(([path, url]) => {
    const file = path.split('/').pop() || ''
    return [file.replace(/\.svg$/i, '').toUpperCase(), url]
  }),
)

export default function CountryFlag({ code }) {
  const src = flags.get(String(code || '').toUpperCase())

  if (!src) {
    return null
  }

  return <img className="auth-flag" src={src} alt="" width="22" height="15" />
}
