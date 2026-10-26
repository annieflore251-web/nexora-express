<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type View = 'dashboard' | 'parcels' | 'agencies' | 'staff' | 'pricing' | 'reports'
type ParcelStatus = 'RECEIVED' | 'REGISTERED' | 'AWAITING_DELIVERY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED' | 'RETURNED'

const API_BASE = 'http://localhost:4000/api'
const currentView = ref<View>('dashboard')
const isLoggedIn = ref(false)
const authBusy = ref(false)
const loading = ref(false)
const apiState = ref<'demo' | 'live'>('demo')
const loginError = ref('')
const sessionUser = ref<{ id: string; fullName: string; email: string; role: string } | null>(null)
const token = ref('')
const parcelMessage = ref('')

const loginForm = ref({
  identifier: 'admin@nexora.com',
  password: 'Password123!'
})

const parcelForm = ref({
  recipientName: 'Amadou Diop',
  recipientPhone: '+221 77 234 56 78',
  deliveryZone: 'Dakar Plateau',
  agencyId: '',
  sendingAgency: 'NEXORA HQ',
  externalTrackingNumber: '',
  deliveryInstructions: 'Leave at reception',
  description: 'Electronics package',
  isExpress: false,
  isBulky: false,
  isCashOnDelivery: false
})

const navItems = [
  { key: 'dashboard', label: 'Tableau de bord', icon: '▣' },
  { key: 'parcels', label: 'Colis', icon: '◫' },
  { key: 'agencies', label: 'Agences', icon: '⌂' },
  { key: 'staff', label: 'Équipe', icon: '◎' },
  { key: 'pricing', label: 'Tarifs', icon: '◌' },
  { key: 'reports', label: 'Rapports', icon: '↗' }
] as const

const fallbackStats = [
  { label: 'Total colis', value: 1248, delta: '+12,4%', trend: 'up', accent: 'cyan' },
  { label: 'En transit', value: 344, delta: '+8,1%', trend: 'up', accent: 'amber' },
  { label: 'Livrés', value: 731, delta: '+15,7%', trend: 'up', accent: 'green' },
  { label: 'Échecs', value: 28, delta: '-2,3%', trend: 'down', accent: 'red' }
]

const fallbackParcels = [
  { trackingNumber: 'NEX-2808-6GBC', recipient: 'Moussa Diop', phone: '+221 77 456 98 10', zone: 'Dakar Plateau', status: 'OUT_FOR_DELIVERY', fee: 3500, date: '2026-10-26' },
  { trackingNumber: 'NEX-2808-98AB', recipient: 'Awa Sall', phone: '+221 76 230 12 44', zone: 'Grand Yoff', status: 'AWAITING_DELIVERY', fee: 4200, date: '2026-10-26' },
  { trackingNumber: 'NEX-2808-AF12', recipient: 'Ibrahim Mbaye', phone: '+221 78 090 45 20', zone: 'Mermoz', status: 'DELIVERED', fee: 3400, date: '2026-10-25' },
  { trackingNumber: 'NEX-2808-3F7D', recipient: 'Fatou Niane', phone: '+221 77 652 34 12', zone: 'Hann', status: 'DELIVERY_FAILED', fee: 3950, date: '2026-10-24' }
]

const fallbackAgencies = [
  { name: 'Dakar Central', code: 'DKC', city: 'Dakar', parcels: 214, active: true },
  { name: 'Thies Hub', code: 'THS', city: 'Thiès', parcels: 146, active: true },
  { name: 'Saint-Louis', code: 'SLU', city: 'Saint-Louis', parcels: 83, active: false }
]

const fallbackStaff = [
  { name: 'Mamadou Sarr', role: 'ADMIN', email: 'mamadou@nexora.sn', active: true },
  { name: 'Khady Diagne', role: 'COORDINATOR', email: 'khady@nexora.sn', active: true },
  { name: 'Lamine Fall', role: 'COURIER', email: 'lamine@nexora.sn', active: true },
  { name: 'Aicha Sow', role: 'PARTNER', email: 'aicha@partner.sn', active: false }
]

const fallbackPricing = [
  { zone: 'Dakar Plateau', baseFee: 2500, express: 1500, bulky: 850, cod: 600, active: true },
  { zone: 'Grand Yoff', baseFee: 2800, express: 1800, bulky: 900, cod: 650, active: true },
  { zone: 'Mermoz', baseFee: 2600, express: 1650, bulky: 700, cod: 550, active: false }
]

const stats = ref(fallbackStats)
const parcels = ref(fallbackParcels)
const agencies = ref(fallbackAgencies)
const staff = ref(fallbackStaff)
const pricing = ref(fallbackPricing)

const totalRevenue = computed(() => {
  return parcels.value.reduce((sum, parcel) => sum + parcel.fee, 0)
})

function formatCurrency(value: number) {
  return new Intl.NumberFormat('fr-SN', {
    style: 'currency',
    currency: 'XOF',
    maximumFractionDigits: 0
  }).format(value)
}

function formatStatus(status: ParcelStatus) {
  const map: Record<ParcelStatus, string> = {
    RECEIVED: 'Reçu',
    REGISTERED: 'Enregistré',
    AWAITING_DELIVERY: 'En attente',
    OUT_FOR_DELIVERY: 'En cours de livraison',
    DELIVERED: 'Livré',
    DELIVERY_FAILED: 'Échec livraison',
    RETURNED: 'Retourné'
  }

  return map[status]
}

function statusStyle(status: ParcelStatus) {
  const map: Record<ParcelStatus, string> = {
    RECEIVED: 'status status-received',
    REGISTERED: 'status status-registered',
    AWAITING_DELIVERY: 'status status-awaiting',
    OUT_FOR_DELIVERY: 'status status-delivering',
    DELIVERED: 'status status-delivered',
    DELIVERY_FAILED: 'status status-failed',
    RETURNED: 'status status-returned'
  }

  return map[status]
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers ?? {})

  if (token.value) {
    headers.set('Authorization', `Bearer ${token.value}`)
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  })

  return response
}

async function loadDashboardData() {
  if (!token.value) return

  loading.value = true

  try {
    const [statsRes, parcelsRes, agenciesRes, staffRes, pricingRes] = await Promise.all([
      apiFetch('/dashboard/stats'),
      apiFetch('/parcels?page=1&limit=5'),
      apiFetch('/agencies'),
      apiFetch('/users'),
      apiFetch('/pricing')
    ])

    if (statsRes.ok) {
      const statsPayload = await statsRes.json()
      apiState.value = 'live'
      if (statsPayload.totalParcels) {
        stats.value = [
          { label: 'Total colis', value: statsPayload.totalParcels, delta: '+12,4%', trend: 'up', accent: 'cyan' },
          { label: 'En transit', value: statsPayload.parcelsByStatus?.OUT_FOR_DELIVERY ?? 0, delta: '+8,1%', trend: 'up', accent: 'amber' },
          { label: 'Livrés', value: statsPayload.parcelsByStatus?.DELIVERED ?? 0, delta: '+15,7%', trend: 'up', accent: 'green' },
          { label: 'Échecs', value: statsPayload.parcelsByStatus?.DELIVERY_FAILED ?? 0, delta: '-2,3%', trend: 'down', accent: 'red' }
        ]
      }
    }

    if (parcelsRes.ok) {
      const parcelsPayload = await parcelsRes.json()
      if (Array.isArray(parcelsPayload.parcels)) {
        parcels.value = parcelsPayload.parcels.slice(0, 5).map((parcel: any) => ({
          trackingNumber: parcel.trackingNumber,
          recipient: parcel.recipientName,
          phone: parcel.recipientPhone,
          zone: parcel.deliveryZone,
          status: parcel.status,
          fee: parcel.deliveryFee ?? 0,
          date: parcel.createdAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
        }))
      }
    }

    if (agenciesRes.ok) {
      const agenciesPayload = await agenciesRes.json()
      if (Array.isArray(agenciesPayload.agencies)) {
        agencies.value = agenciesPayload.agencies.slice(0, 3).map((agency: any) => ({
          name: agency.name,
          code: agency.code,
          city: agency.city ?? 'N/A',
          parcels: agency._count?.parcels ?? 0,
          active: agency.isActive
        }))
      }
    }

    if (staffRes.ok) {
      const staffPayload = await staffRes.json()
      if (Array.isArray(staffPayload.users)) {
        staff.value = staffPayload.users.slice(0, 4).map((user: any) => ({
          name: user.fullName,
          role: user.role,
          email: user.email,
          active: user.isActive
        }))
      }
    }

    if (pricingRes.ok) {
      const pricingPayload = await pricingRes.json()
      if (Array.isArray(pricingPayload.pricingRules)) {
        pricing.value = pricingPayload.pricingRules.slice(0, 3).map((rule: any) => ({
          zone: rule.zone,
          baseFee: rule.baseFee,
          express: rule.expressSurcharge,
          bulky: rule.bulkySurcharge,
          cod: rule.cashOnDeliverySurcharge,
          active: rule.isActive
        }))
      }
    }
  } catch (error) {
    console.warn('Utilisation des données de démonstration car l’API n’est pas disponible.', error)
    apiState.value = 'demo'
    stats.value = fallbackStats
    parcels.value = fallbackParcels
    agencies.value = fallbackAgencies
    staff.value = fallbackStaff
    pricing.value = fallbackPricing
  } finally {
    loading.value = false
  }
}

async function registerParcel() {
  parcelMessage.value = ''

  try {
    const response = await apiFetch('/parcels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...parcelForm.value,
        agencyId: parcelForm.value.agencyId || undefined,
        isExpress: Boolean(parcelForm.value.isExpress),
        isBulky: Boolean(parcelForm.value.isBulky),
        isCashOnDelivery: Boolean(parcelForm.value.isCashOnDelivery)
      })
    })

    const payload = await response.json()

    if (!response.ok || !payload.success) {
      throw new Error(payload.message || 'Impossible d’enregistrer le colis.')
    }

    parcelMessage.value = `Colis ${payload.parcel?.trackingNumber || 'créé'} enregistré avec succès.`
    parcelForm.value = {
      recipientName: '',
      recipientPhone: '',
      deliveryZone: 'Dakar Plateau',
      agencyId: '',
      sendingAgency: 'NEXORA HQ',
      externalTrackingNumber: '',
      deliveryInstructions: '',
      description: '',
      isExpress: false,
      isBulky: false,
      isCashOnDelivery: false
    }
    await loadDashboardData()
  } catch (error) {
    parcelMessage.value = error instanceof Error ? error.message : 'Échec de l’enregistrement du colis.'
  }
}

async function exportReport() {
  try {
    const response = await apiFetch('/dashboard/delivery-report/export?startDate=2026-10-01&endDate=2026-10-31')

    if (!response.ok) {
      throw new Error('Impossible de télécharger le rapport.')
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'nexora-delivery-report.csv'
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Échec de l’export CSV', error)
  }
}

async function doLogin() {
  if (!loginForm.value.identifier || !loginForm.value.password) {
    loginError.value = 'Veuillez saisir votre e-mail et votre mot de passe.'
    return
  }

  authBusy.value = true
  loginError.value = ''

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: loginForm.value.identifier,
        password: loginForm.value.password
      })
    })

    const payload = await res.json()

    if (!res.ok || !payload.success) {
      throw new Error(payload.message || 'Échec de la connexion.')
    }

    token.value = payload.token
    sessionUser.value = payload.user
    localStorage.setItem('nexora-token', payload.token)
    localStorage.setItem('nexora-user', JSON.stringify(payload.user))
    isLoggedIn.value = true

    await loadDashboardData()
  } catch (error) {
    loginError.value = error instanceof Error ? error.message : 'Impossible de se connecter pour le moment.'
    isLoggedIn.value = false
  } finally {
    authBusy.value = false
  }
}

function logout() {
  token.value = ''
  sessionUser.value = null
  isLoggedIn.value = false
  localStorage.removeItem('nexora-token')
  localStorage.removeItem('nexora-user')
  loginError.value = ''
}

onMounted(() => {
  const savedToken = localStorage.getItem('nexora-token')
  const savedUser = localStorage.getItem('nexora-user')

  if (savedToken && savedUser) {
    token.value = savedToken
    sessionUser.value = JSON.parse(savedUser)
    isLoggedIn.value = true
    loadDashboardData()
  }
})
</script>

<template>
  <div class="app-shell">
    <div v-if="!isLoggedIn" class="login-screen">
      <div class="auth-panel">
        <div class="brand-block">
          <div class="brand-badge">N</div>
          <div>
            <p class="eyebrow">Plateforme de gestion logistique</p>
            <h1>NEXORA Express</h1>
          </div>
        </div>

        <div class="login-card">
          <div class="card-header">
            <span class="chip success">Accès sécurisé</span>
            <h2>Connexion admin</h2>
          </div>

          <label>
            E-mail ou téléphone
            <input v-model="loginForm.identifier" type="text" placeholder="admin@nexora.com" />
          </label>

          <label>
            Mot de passe
            <input v-model="loginForm.password" type="password" placeholder="•••••••••••" />
          </label>

          <button class="primary-button" :disabled="authBusy" @click="doLogin">
            {{ authBusy ? 'Connexion...' : 'Se connecter' }}
          </button>

          <p v-if="loginError" class="error-text">{{ loginError }}</p>

          <div class="demo-box">
            <strong>Identifiants de démo</strong>
            <span>admin@nexora.com / Password123!</span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="dashboard-shell">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="brand-mini">N</div>
          <div>
            <h2>NEXORA</h2>
            <p>Opérations</p>
          </div>
        </div>

        <nav class="nav-list">
          <button
            v-for="item in navItems"
            :key="item.key"
            class="nav-item"
            :class="{ active: currentView === item.key }"
            @click="currentView = item.key"
          >
            <span>{{ item.icon }}</span>
            {{ item.label }}
          </button>
        </nav>

        <div class="profile-card">
          <div class="avatar">{{ sessionUser?.fullName?.charAt(0) || 'A' }}</div>
          <div>
            <strong>{{ sessionUser?.fullName || 'Utilisateur admin' }}</strong>
            <span>{{ sessionUser?.role || 'ADMIN' }}</span>
          </div>
          <button class="ghost-button" @click="logout">Déconnexion</button>
        </div>
      </aside>

      <main class="main-panel">
        <header class="topbar">
          <div>
            <p class="eyebrow">Vue d’ensemble</p>
            <h1>
              {{ currentView === 'dashboard' ? 'Tableau de bord' : currentView === 'parcels' ? 'Colis' : currentView === 'agencies' ? 'Agences' : currentView === 'staff' ? 'Équipe' : currentView === 'pricing' ? 'Tarifs' : 'Rapports' }}
            </h1>
          </div>

          <div class="topbar-actions">
            <span class="connection-badge" :class="apiState === 'live' ? 'is-live' : 'is-demo'">
              {{ apiState === 'live' ? 'API active' : 'Données démo' }}
            </span>
            <button class="ghost-button">Filtrer</button>
            <button class="primary-button" @click="exportReport">Exporter</button>
          </div>
        </header>

        <section v-if="currentView === 'dashboard'" class="content-grid">
          <div class="stats-grid">
            <article v-for="stat in stats" :key="stat.label" class="stat-card" :class="`accent-${stat.accent}`">
              <div class="stat-meta">
                <span>{{ stat.label }}</span>
                <strong :class="stat.trend === 'up' ? 'trend-up' : 'trend-down'">{{ stat.delta }}</strong>
              </div>
              <h3>{{ stat.value }}</h3>
            </article>
          </div>

          <div class="panel-card wide">
            <div class="panel-head">
              <h3>Activité récente</h3>
              <button class="ghost-button small">Voir tout</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Suivi</th>
                  <th>Destinataire</th>
                  <th>Zone</th>
                  <th>Statut</th>
                  <th>Frais</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="parcel in parcels" :key="parcel.trackingNumber">
                  <td>{{ parcel.trackingNumber }}</td>
                  <td>{{ parcel.recipient }}</td>
                  <td>{{ parcel.zone }}</td>
                  <td><span :class="statusStyle(parcel.status)">{{ formatStatus(parcel.status) }}</span></td>
                  <td>{{ formatCurrency(parcel.fee) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="panel-card">
            <div class="panel-head">
              <h3>Revenus</h3>
            </div>
            <div class="revenue-box">
              <span>Revenu total confirmé</span>
              <strong>{{ formatCurrency(totalRevenue) }}</strong>
            </div>
            <ul class="mini-list">
              <li><span>Paiement à la livraison</span><strong>42%</strong></li>
              <li><span>Commandes express</span><strong>26%</strong></li>
              <li><span>Retours</span><strong>7%</strong></li>
            </ul>
          </div>

          <div class="panel-card">
            <div class="panel-head">
              <h3>Couverture agence</h3>
            </div>
            <div v-for="agency in agencies" :key="agency.code" class="list-row">
              <div>
                <strong>{{ agency.name }}</strong>
                <small>{{ agency.city }}</small>
              </div>
              <span class="tag" :class="agency.active ? 'tag-success' : 'tag-muted'">{{ agency.active ? 'Actif' : 'Suspendue' }}</span>
            </div>
          </div>
        </section>

        <section v-else-if="currentView === 'parcels'" class="panel-card content-block">
          <div class="panel-head">
            <h3>Gestion des colis</h3>
            <button class="primary-button small">+ Nouveau colis</button>
          </div>

          <div class="parcel-form">
            <div class="form-grid">
              <label>
                Nom du destinataire
                <input v-model="parcelForm.recipientName" type="text" />
              </label>
              <label>
                Téléphone du destinataire
                <input v-model="parcelForm.recipientPhone" type="text" />
              </label>
              <label>
                Zone de livraison
                <input v-model="parcelForm.deliveryZone" type="text" />
              </label>
              <label>
                Suivi externe
                <input v-model="parcelForm.externalTrackingNumber" type="text" />
              </label>
              <label>
                Agence expéditrice
                <input v-model="parcelForm.sendingAgency" type="text" />
              </label>
              <label>
                ID agence
                <input v-model="parcelForm.agencyId" type="text" placeholder="optionnel" />
              </label>
            </div>

            <div class="checkbox-row">
              <label><input v-model="parcelForm.isExpress" type="checkbox" /> Express</label>
              <label><input v-model="parcelForm.isBulky" type="checkbox" /> Encombrant</label>
              <label><input v-model="parcelForm.isCashOnDelivery" type="checkbox" /> Paiement à la livraison</label>
            </div>

            <label>
              Instructions de livraison
              <textarea v-model="parcelForm.deliveryInstructions" rows="3" />
            </label>

            <div class="actions-row">
              <button class="primary-button" @click="registerParcel">Enregistrer le colis</button>
            </div>

            <p v-if="parcelMessage" class="form-message">{{ parcelMessage }}</p>
          </div>

          <table>
            <thead>
              <tr>
                <th>Suivi</th>
                <th>Destinataire</th>
                <th>Téléphone</th>
                <th>Zone</th>
                <th>Frais</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="parcel in parcels" :key="parcel.trackingNumber + '-parcel'">
                <td>{{ parcel.trackingNumber }}</td>
                <td>{{ parcel.recipient }}</td>
                <td>{{ parcel.phone }}</td>
                <td>{{ parcel.zone }}</td>
                <td>{{ formatCurrency(parcel.fee) }}</td>
                <td><span :class="statusStyle(parcel.status)">{{ formatStatus(parcel.status) }}</span></td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-else-if="currentView === 'agencies'" class="panel-card content-block">
          <div class="panel-head">
            <h3>Réseau d'agences</h3>
            <button class="primary-button small">+ Ajouter une agence</button>
          </div>
          <div class="grid-three">
            <div v-for="agency in agencies" :key="agency.code" class="info-tile">
              <div class="tile-head">
                <strong>{{ agency.name }}</strong>
                <span class="tag" :class="agency.active ? 'tag-success' : 'tag-muted'">{{ agency.active ? 'Actif' : 'Inactif' }}</span>
              </div>
              <p>{{ agency.code }} • {{ agency.city }}</p>
              <small>{{ agency.parcels }} colis traités</small>
            </div>
          </div>
        </section>

        <section v-else-if="currentView === 'staff'" class="panel-card content-block">
          <div class="panel-head">
            <h3>Équipe et partenaires</h3>
            <button class="primary-button small">+ Ajouter un membre</button>
          </div>
          <div class="staff-list">
            <div v-for="member in staff" :key="member.email" class="list-row">
              <div>
                <strong>{{ member.name }}</strong>
                <small>{{ member.email }}</small>
              </div>
              <div class="member-meta">
                <span class="badge">{{ member.role }}</span>
                <span class="tag" :class="member.active ? 'tag-success' : 'tag-muted'">{{ member.active ? 'Actif' : 'Désactivé' }}</span>
              </div>
            </div>
          </div>
        </section>

        <section v-else-if="currentView === 'pricing'" class="panel-card content-block">
          <div class="panel-head">
            <h3>Règles tarifaires</h3>
            <button class="primary-button small">+ Nouvelle zone</button>
          </div>
          <div class="pricing-grid">
            <div v-for="rule in pricing" :key="rule.zone" class="pricing-box">
              <div class="tile-head">
                <strong>{{ rule.zone }}</strong>
                <span class="tag" :class="rule.active ? 'tag-success' : 'tag-muted'">{{ rule.active ? 'Actif' : 'Brouillon' }}</span>
              </div>
              <ul>
                <li>Frais de base : {{ formatCurrency(rule.baseFee) }}</li>
                <li>Express : {{ formatCurrency(rule.express) }}</li>
                <li>Encombrant : {{ formatCurrency(rule.bulky) }}</li>
                <li>Paiement à la livraison : {{ formatCurrency(rule.cod) }}</li>
              </ul>
            </div>
          </div>
        </section>

        <section v-else class="panel-card content-block">
          <div class="panel-head">
            <h3>Rapports de livraison</h3>
            <button class="primary-button small">Télécharger CSV</button>
          </div>
          <div class="report-grid">
            <div class="report-item">
              <span>Livrés</span>
              <strong>731</strong>
            </div>
            <div class="report-item">
              <span>En cours</span>
              <strong>344</strong>
            </div>
            <div class="report-item">
              <span>Échecs</span>
              <strong>28</strong>
            </div>
            <div class="report-item">
              <span>En attente</span>
              <strong>145</strong>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
:global(html, body, #__nuxt) {
  margin: 0;
  min-height: 100%;
  font-family: Inter, 'Segoe UI', sans-serif;
  background: #07111f;
}

* {
  box-sizing: border-box;
}

button,
input {
  font: inherit;
}

button {
  cursor: pointer;
}

.app-shell {
  min-height: 100vh;
  background: radial-gradient(circle at top, #102645 0%, #07111f 42%, #020a11 100%);
  color: #edf5ff;
}

.login-screen {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.auth-panel {
  width: min(1100px, 100%);
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 28px;
  background: rgba(11, 19, 32, 0.75);
  box-shadow: 0 30px 80px rgba(1, 7, 18, 0.7);
  overflow: hidden;
}

.brand-block {
  position: relative;
  padding: 52px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: linear-gradient(135deg, rgba(34, 89, 160, 0.45), rgba(7, 17, 31, 0.2));
}

.brand-badge,
.brand-mini {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 15px;
  font-weight: 800;
  background: linear-gradient(135deg, #7dd3fc, #38bdf8);
  color: #04111d;
  box-shadow: 0 15px 30px rgba(56, 189, 248, 0.5);
}

.brand-block h1 {
  margin: 16px 0 0;
  font-size: clamp(2.5rem, 5vw, 4.5rem);
  line-height: 1;
}

.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.72rem;
  color: #7dd3fc;
}

.login-card {
  padding: 32px 28px;
  background: rgba(4, 10, 17, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 18px;
}

.card-header {
  margin-bottom: 12px;
}

.card-header h2 {
  margin: 10px 0 0;
  font-size: 1.8rem;
}

.chip {
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

.chip.success {
  background: rgba(22, 163, 74, 0.15);
  color: #86efac;
}

label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #dbeafe;
  font-size: 0.9rem;
}

input,
textarea {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.8);
  color: #edf5ff;
  padding: 14px 16px;
  outline: none;
}

textarea {
  resize: vertical;
}

input:focus,
textarea:focus {
  border-color: rgba(125, 211, 252, 0.8);
  box-shadow: 0 0 0 3px rgba(125, 211, 252, 0.16);
}

.primary-button,
.ghost-button {
  border: 0;
  border-radius: 12px;
  padding: 12px 16px;
  font-weight: 700;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.primary-button {
  background: linear-gradient(135deg, #38bdf8, #2563eb);
  color: #f8fbff;
  box-shadow: 0 12px 25px rgba(37, 99, 235, 0.35);
}

.ghost-button {
  background: rgba(148, 163, 184, 0.12);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.primary-button.small,
.ghost-button.small {
  padding: 8px 12px;
  font-size: 0.8rem;
}

button:hover {
  transform: translateY(-1px);
}

button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.error-text {
  margin: 0;
  color: #fca5a5;
  font-size: 0.9rem;
}

.demo-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 15px;
  border-radius: 14px;
  background: rgba(15, 118, 110, 0.12);
  border: 1px solid rgba(94, 234, 212, 0.2);
  color: #ccfbf1;
}

.dashboard-shell {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
}

.sidebar {
  padding: 28px 18px;
  background: rgba(10, 18, 31, 0.9);
  border-right: 1px solid rgba(148, 163, 184, 0.12);
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px 18px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.sidebar-header h2,
.sidebar-header p {
  margin: 0;
}

.sidebar-header p {
  color: #94a3b8;
  font-size: 0.78rem;
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-item {
  background: transparent;
  color: #dfeaf7;
  border: 1px solid transparent;
  border-radius: 12px;
  text-align: left;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
}

.nav-item.active {
  background: rgba(59, 130, 246, 0.12);
  border-color: rgba(96, 165, 250, 0.25);
  color: #dbeafe;
}

.profile-card {
  margin-top: auto;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 18px;
  padding: 16px;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 12px;
}

.profile-card strong,
.profile-card span {
  display: block;
}

.profile-card span {
  color: #94a3b8;
  font-size: 0.8rem;
}

.avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #67e8f9, #60a5fa);
  color: #02131d;
  font-weight: 800;
}

.main-panel {
  padding: 32px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 28px;
}

.topbar h1 {
  margin: 8px 0 0;
  font-size: clamp(1.8rem, 2vw, 2.6rem);
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.connection-badge {
  display: inline-flex;
  align-items: center;
  padding: 7px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

.connection-badge.is-live {
  background: rgba(16, 185, 129, 0.16);
  color: #a7f3d0;
}

.connection-badge.is-demo {
  background: rgba(251, 191, 36, 0.15);
  color: #fde68a;
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 22px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  grid-column: 1 / -1;
}

.stat-card,
.panel-card,
.info-tile,
.pricing-box {
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.2);
}

.stat-card {
  padding: 20px 18px;
}

.accent-cyan {
  border-top: 3px solid #38bdf8;
}

.accent-amber {
  border-top: 3px solid #fbbf24;
}

.accent-green {
  border-top: 3px solid #34d399;
}

.accent-red {
  border-top: 3px solid #f87171;
}

.stat-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  color: #c7d7eb;
  font-size: 0.82rem;
}

.stat-card h3 {
  margin: 20px 0 0;
  font-size: clamp(1.8rem, 2vw, 2.5rem);
}

.trend-up {
  color: #86efac;
}

.trend-down {
  color: #fca5a5;
}

.panel-card {
  padding: 22px 20px;
}

.wide {
  grid-column: span 8;
}

.panel-card:not(.wide) {
  grid-column: span 4;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.panel-head h3 {
  margin: 0;
  font-size: 1.1rem;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  padding: 12px 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  color: #dfeaf7;
}

th {
  color: #94a3b8;
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status {
  display: inline-flex;
  padding: 7px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.status-received { background: rgba(96, 165, 250, 0.16); color: #bfdbfe; }
.status-registered { background: rgba(167, 139, 250, 0.16); color: #ddd6fe; }
.status-awaiting { background: rgba(251, 191, 36, 0.16); color: #fde68a; }
.status-delivering { background: rgba(59, 130, 246, 0.18); color: #93c5fd; }
.status-delivered { background: rgba(16, 185, 129, 0.15); color: #a7f3d0; }
.status-failed { background: rgba(239, 68, 68, 0.18); color: #fecaca; }
.status-returned { background: rgba(148, 163, 184, 0.18); color: #e2e8f0; }

.revenue-box {
  padding: 18px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(13, 148, 136, 0.18));
  border: 1px solid rgba(96, 165, 250, 0.2);
}

.revenue-box span {
  color: #c7d7eb;
  display: block;
  font-size: 0.8rem;
}

.revenue-box strong {
  display: block;
  margin-top: 10px;
  font-size: 2rem;
}

.mini-list {
  list-style: none;
  padding: 0;
  margin: 18px 0 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mini-list li,
.list-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.mini-list li {
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  padding-bottom: 8px;
}

.list-row {
  padding: 12px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.list-row strong,
.tile-head strong {
  display: block;
}

.list-row small,
.tile-head + p,
.info-tile small,
.pricing-box li {
  color: #9fb3c8;
}

.tag,
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 6px 8px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.tag-success { background: rgba(16, 185, 129, 0.15); color: #a7f3d0; }
.tag-muted { background: rgba(148, 163, 184, 0.12); color: #d8e2f2; }
.badge { background: rgba(59,130,246,0.18); color: #bfdbfe; }

.content-block {
  margin-top: 16px;
}

.grid-three,
.pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.info-tile,
.pricing-box {
  padding: 18px;
}

.tile-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.staff-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.member-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pricing-box ul {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.parcel-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.checkbox-row {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
}

.checkbox-row label {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}

.checkbox-row input {
  width: auto;
}

.actions-row {
  display: flex;
  justify-content: flex-end;
}

.form-message {
  margin: 0;
  color: #a7f3d0;
  font-weight: 600;
}

.report-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.report-item {
  padding: 18px;
  border-radius: 18px;
  background: rgba(11, 18, 31, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.report-item span {
  display: block;
  color: #a7bed8;
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.report-item strong {
  display: block;
  margin-top: 8px;
  font-size: 2rem;
}

@media (max-width: 1024px) {
  .dashboard-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    border-right: 0;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  }

  .auth-panel,
  .grid-three,
  .pricing-grid,
  .report-grid,
  .stats-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 720px) {
  .auth-panel,
  .stats-grid,
  .grid-three,
  .pricing-grid,
  .report-grid {
    grid-template-columns: 1fr;
  }

  .main-panel {
    padding: 22px 16px;
  }

  .topbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .panel-card:not(.wide),
  .wide {
    grid-column: 1 / -1;
  }
}
</style>
