'use client';
import LoginScreen from '../LoginScreen';
import { loginDestination } from '../access-destinations';
export default function LoginPage() {
  return <LoginScreen onLogin={() => {
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.assign(loginDestination(next));
  }} />;
}
