import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your password for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Redefinir sua senha</Heading>
        <Text style={text}>
          Recebemos um pedido para redefinir a senha da sua conta no{' '}
          <strong>{siteName}</strong>. Clique no botão abaixo para criar uma
          nova senha — o link é válido por tempo limitado.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Redefinir senha
        </Button>
        <Text style={text}>
          Se o botão não funcionar, copie e cole este endereço no navegador:
          <br />
          <a href={confirmationUrl} style={fallbackLink}>{confirmationUrl}</a>
        </Text>
        <Text style={footer}>
          Se você não solicitou a redefinição, pode ignorar este e-mail com
          segurança — sua senha não será alterada.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = {
  padding: '28px 32px',
  maxWidth: '520px',
  borderTop: '4px solid #d4a72c',
}
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#0f4d2a',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#333333',
  lineHeight: '1.5',
  margin: '0 0 20px',
}
const button = {
  backgroundColor: '#0f4d2a',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '14px 24px',
  textDecoration: 'none',
}
const fallbackLink = { color: '#0f4d2a', wordBreak: 'break-all' as const, fontSize: '12px' }
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
