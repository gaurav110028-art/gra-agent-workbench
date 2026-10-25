'use client';
import LoginScreen from '../LoginScreen';
export default function LoginPage() {
  return <LoginScreen onLogin={() => {
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.assign(next === '/redactor' ? '/redactor' : '/');
  }} />;
}
