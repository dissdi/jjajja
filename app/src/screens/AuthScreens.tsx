// 로그인 / 회원가입 (계약 v2.0 — 로그인 필수, GitHub #20). 문구: copy.auth (senior-ux-korean 원칙)
// 실패 code → copy.auth.error 문구. 서버 message_ko는 쓰지 않는다.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { login, signup, type AuthFailCode } from '../api/client';
import type { AuthResponse } from '../api/contract';
import { currentDeviceName } from '../auth/deviceName';
import { Button, InlineError, Note, Rule, T, TextField, TopBar } from '../components/ui';
import { copy } from '../ux/copy';
import { color, font, size, space } from '../ux/theme';

export const MIN_PASSWORD_LENGTH = 8;

type AuthErrKey = keyof typeof copy.auth.error;

/** 실패 code → 문구 키. 모르는 값은 unknown */
export function authErrorText(code: AuthFailCode | AuthErrKey): string {
  const table = copy.auth.error as Record<string, string>;
  return table[code] ?? copy.auth.error.unknown;
}

function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={shown ? copy.auth.hidePassword : copy.auth.showPassword}
      onPress={onToggle}
      style={styles.eye}
      hitSlop={4}
    >
      <MaterialCommunityIcons name={shown ? 'eye-off-outline' : 'eye-outline'} size={24} color={color.inkSecondary} />
    </Pressable>
  );
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TopBar />
        <View style={{ marginTop: space.section }}>
          <T style={[font.display, { color: color.ink }]} accessibilityRole="header">
            {title}
          </T>
          <Rule style={{ marginTop: space[3] }} />
          <T style={[font.body, { color: color.inkSecondary, marginTop: space[3] }]}>{subtitle}</T>
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// 로그인
// ---------------------------------------------------------------------------

interface LoginProps {
  onLoggedIn: (res: AuthResponse) => void | Promise<void>;
  onGoSignup: () => void;
  /** pending: 공유로 들어온 영상을 로그인 후 확인 / expired: 401로 로그인이 풀림 */
  notice?: 'pending' | 'expired' | null;
}

export function LoginScreen({ onLoggedIn, onGoSignup, notice = null }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    const e = email.trim();
    setEmailErr(e ? null : copy.auth.error.emailEmpty);
    setPwErr(password ? null : copy.auth.error.passwordEmpty);
    setFormErr(null);
    if (!e || !password) return;
    setBusy(true);
    const out = await login(e, password, currentDeviceName());
    setBusy(false);
    if (out.ok) {
      await onLoggedIn(out.data);
      return;
    }
    if (out.code === 'invalid_email') setEmailErr(authErrorText(out.code));
    else setFormErr(authErrorText(out.code));
  };

  return (
    <Shell title={copy.auth.login.title} subtitle={copy.auth.login.subtitle}>
      {notice && (
        <Note
          text={notice === 'pending' ? copy.auth.login.pendingNote : copy.auth.login.expiredNote}
          style={{ marginTop: space[5] }}
        />
      )}
      <View style={{ marginTop: space[6] }}>
        <TextField
          label={copy.auth.emailLabel}
          placeholder={copy.auth.emailPlaceholder}
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setEmailErr(null);
            setFormErr(null);
          }}
          error={emailErr}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          testID="login-email"
        />
      </View>
      <View style={{ marginTop: space[5] }}>
        <TextField
          label={copy.auth.passwordLabel}
          placeholder={copy.auth.passwordPlaceholder}
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setPwErr(null);
            setFormErr(null);
          }}
          error={pwErr}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          right={<PasswordToggle shown={shown} onToggle={() => setShown((s) => !s)} />}
          testID="login-password"
        />
      </View>
      {formErr && <InlineError text={formErr} testID="login-error" />}
      <View style={{ marginTop: space[6] }}>
        <Button label={busy ? copy.auth.submitting : copy.auth.login.submit} onPress={submit} disabled={busy} testID="login-submit" />
      </View>
      <View style={{ marginTop: space.section }}>
        <Button variant="secondary" label={copy.auth.login.toSignup} onPress={onGoSignup} />
        <T style={[font.caption, styles.caption]}>{copy.auth.login.toSignupHint}</T>
      </View>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// 회원가입 — 이메일, 비밀번호(8자 이상 안내), 비밀번호 확인
// ---------------------------------------------------------------------------

interface SignupProps {
  onSignedUp: (res: AuthResponse) => void | Promise<void>;
  onGoLogin: () => void;
  notice?: 'pending' | null;
}

/** 가입 전 앱 검사: 빈칸 → 형식(@) → 8자 → 두 비밀번호 일치. 통과하면 null */
export function validateSignup(email: string, password: string, confirm: string) {
  const e = email.trim();
  const errs: { email: string | null; password: string | null; confirm: string | null } = {
    email: !e ? copy.auth.error.emailEmpty : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? null : copy.auth.error.invalid_email,
    password: !password
      ? copy.auth.error.passwordEmpty
      : password.length < MIN_PASSWORD_LENGTH
        ? copy.auth.error.weak_password
        : null,
    confirm: password && confirm !== password ? copy.auth.error.passwordMismatch : null,
  };
  return errs.email || errs.password || errs.confirm ? errs : null;
}

export function SignupScreen({ onSignedUp, onGoLogin, notice = null }: SignupProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<{ email: string | null; password: string | null; confirm: string | null }>({
    email: null,
    password: null,
    confirm: null,
  });
  const [formErr, setFormErr] = useState<string | null>(null);

  const clear = (k: keyof typeof errs) => {
    setErrs((p) => ({ ...p, [k]: null }));
    setFormErr(null);
  };

  const submit = async () => {
    if (busy) return;
    setFormErr(null);
    const v = validateSignup(email, password, confirm);
    if (v) {
      setErrs(v);
      return;
    }
    setErrs({ email: null, password: null, confirm: null });
    setBusy(true);
    const out = await signup(email.trim(), password, currentDeviceName());
    setBusy(false);
    if (out.ok) {
      await onSignedUp(out.data);
      return;
    }
    if (out.code === 'email_taken' || out.code === 'invalid_email') setErrs((p) => ({ ...p, email: authErrorText(out.code) }));
    else if (out.code === 'weak_password') setErrs((p) => ({ ...p, password: authErrorText(out.code) }));
    else setFormErr(authErrorText(out.code));
  };

  return (
    <Shell title={copy.auth.signup.title} subtitle={copy.auth.signup.subtitle}>
      {notice && <Note text={copy.auth.login.pendingNote} style={{ marginTop: space[5] }} />}
      <View style={{ marginTop: space[6] }}>
        <TextField
          label={copy.auth.emailLabel}
          placeholder={copy.auth.emailPlaceholder}
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            clear('email');
          }}
          error={errs.email}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          testID="signup-email"
        />
      </View>
      <View style={{ marginTop: space[5] }}>
        <TextField
          label={copy.auth.passwordLabel}
          placeholder={copy.auth.passwordPlaceholder}
          hint={copy.auth.signup.passwordHint}
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            clear('password');
          }}
          error={errs.password}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          right={<PasswordToggle shown={shown} onToggle={() => setShown((s) => !s)} />}
          testID="signup-password"
        />
      </View>
      <View style={{ marginTop: space[5] }}>
        <TextField
          label={copy.auth.passwordConfirmLabel}
          placeholder={copy.auth.passwordConfirmPlaceholder}
          value={confirm}
          onChangeText={(t) => {
            setConfirm(t);
            clear('confirm');
          }}
          error={errs.confirm}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
          testID="signup-confirm"
        />
      </View>
      {formErr && <InlineError text={formErr} testID="signup-error" />}
      <View style={{ marginTop: space[6] }}>
        <Button label={busy ? copy.auth.submitting : copy.auth.signup.submit} onPress={submit} disabled={busy} testID="signup-submit" />
      </View>
      <View style={{ marginTop: space.section }}>
        <Button variant="secondary" label={copy.auth.signup.toLogin} onPress={onGoLogin} />
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: space.screenX, paddingBottom: space[8], backgroundColor: color.paper },
  caption: { color: color.inkTertiary, textAlign: 'center', marginTop: 6 },
  eye: { width: size.touchMin, height: size.touchMin, alignItems: 'center', justifyContent: 'center' },
});
