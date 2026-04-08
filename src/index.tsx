/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import App from './App.tsx'
import { applyTheme, loadThemeMode } from './theme'

const root = document.getElementById('root')

applyTheme(loadThemeMode())

render(() => <App />, root!)
