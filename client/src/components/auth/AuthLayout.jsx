import { MarkIcon } from './icons.jsx'
import '../../styles/auth.css'

export default function AuthLayout({ kicker, title, description, features, children }) {
  return (
    <section className="auth-screen">
      <div className="auth-brand">
        <div className="auth-logo">
          <MarkIcon />
          <span>
            <strong>BNC Motors</strong>
            <small>Automotive spare parts</small>
          </span>
        </div>
        <div className="auth-intro">
          <span className="auth-accent" />
          <h1>
            <span>{kicker}</span>
            {title}
          </h1>
          <p>{description}</p>
          <ul className="auth-features">
            {features.map((feature) => (
              <li key={feature.label}>
                <span className="auth-feature-icon" aria-hidden="true">{feature.icon}</span>
                {feature.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="auth-stage">{children}</div>
    </section>
  )
}
