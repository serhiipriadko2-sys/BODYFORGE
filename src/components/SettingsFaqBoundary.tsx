import { Component, type ReactNode } from 'react';

/** Keep a rejected settings or nested backup chunk inside its own screen. */
export default class SettingsFaqBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (!this.state.failed) return this.props.children;

    return <div data-settings-state="error">
      <p role="alert">Не удалось открыть настройки. Обнови страницу и открой их ещё раз.</p>
      <div className="bf-goal-actions">
        {/* React.lazy caches a rejected import. A fresh document retries it. */}
        <button type="button" className="bf-small-action" data-action="reload-settings"
          onClick={() => window.location.reload()}>Обновить страницу</button>
      </div>
    </div>;
  }
}
