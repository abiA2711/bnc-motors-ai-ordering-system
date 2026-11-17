export default function SectionNotice({ title, message }) {
  return (
    <section className="panel">
      <h1>{title}</h1>
      <p className="lede">{message}</p>
    </section>
  )
}
