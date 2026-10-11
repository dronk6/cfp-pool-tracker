import LoginForm from "../components/LoginForm/LoginForm";
import styles from "./page.module.css";

export default function LoginPage() {
  return (
    <main className={styles.container}>
      <h1>Log In</h1>
      <LoginForm />
    </main>
  );
}
