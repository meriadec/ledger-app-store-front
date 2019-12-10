/* eslint-disable no-shadow */

const fetch = require('node-fetch')
const fs = require('fs')
const semver = require('semver')
const uniqBy = require('lodash/uniqBy')

if (!process.env.APP_STORE_TOKEN) {
  throw new Error('You need a APP_STORE_TOKEN env var')
}

const API_URL = 'https://manager.api.live.ledger.com/api'

async function fetchJSON(endpoint) {
  const url = `${API_URL}${endpoint}`
  const res = await fetch(url, {
    headers: {
      authorization: `Token ${process.env.APP_STORE_TOKEN}`,
    },
  })
  const data = await res.json()
  return data
}

async function main() {
  const [apps, providers, firmwares] = await Promise.all([
    fetchJSON('/applications'),
    fetchJSON('/providers'),
    fetchJSON('/firmwares'),
  ])

  apps.sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1))

  const final = providers.filter(p => p.id === 7).map(provider => {
    const providerID = provider.id
    return {
      provider: providerID,
      firmwares: firmwares
        .filter(f => {
          return f.name === 'Ledger nano S firmware'
        })
        .map(firmware => {
          const finals = firmware.se_firmware_final_versions
          finals.sort((a, b) => {
            const vA = semver.valid(a.name) ? a.name : a.version
            const vB = semver.valid(b.name) ? b.name : b.version
            return semver.gt(vA, vB) ? 1 : semver.lt(vA, vB) ? -1 : 0 // eslint-disable-line no-nested-ternary
          })
          return {
            name: firmware.name,
            finals: finals
              .filter(final => final.providers.find(p => p === providerID))
              .filter(final => final.name === '1.6.0')
              .map(final => {
                const allAppVersions = apps.reduce((acc, app) => {
                  app.application_versions.forEach(appVersion => {
                    const identifier = `${appVersion.name} ${appVersion.version}`
                    if (!appVersion.providers.find(p => p === providerID)) {
                      return
                    }
                    if (!appVersion.se_firmware_final_versions.find(f => f === final.id)) {
                      return
                    }
                    acc.push(appVersion)
                  })
                  return acc
                }, [])
                return {
                  version: final.name,
                  applications: allAppVersions,
                }
              }),
          }
        }),
    }
  })

  const whatWeWant = final[0].firmwares[0].finals

  whatWeWant.forEach(el => {
    el.applications = el.applications.filter(app => {
      return !el.applications.find(counterApp => {
        if (app.name === counterApp.name) {
          if (semver.gt(counterApp.version, app.version)) {
            return true
          }
        }
        return false
      })
      return false
    })
  })

  const everyApp = [
    ...whatWeWant[0].applications,
    // ...whatWeWant[1].applications,
    // ...whatWeWant[2].applications,
  ]

  // console.log(everyApp.filter(a => {
  //   return a.name === 'GameCredits'
  // }))

  // const gameCredTest = everyApp.find(a => a.id === 710)

  for (let i = 0; i < everyApp.length; i++) {
    await putOnProviderOne(everyApp[i])
    console.log(`done ${i + 1}/${everyApp.length}`)
  }
}

async function putOnProviderOne(app) {
  if (!app) {
    console.log(`no app`)
    return
  }
  const url = `${API_URL}/application_versions/${app.id}`
  if (app.providers.indexOf(1) > -1) {
    console.log(`provider 1 is already in for ${app.name} ${app.version}`)
    return
  }
  const newApp = {
    ...app,
    providers: [...app.providers, 1],
  }
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        authorization: `Token ${process.env.APP_STORE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newApp),
    })
    console.log(`successfully updated ${app.name} ${app.version}`)
    const text = await res.text()
    console.log(text)
  } catch (err) {
    console.log(`not successfully updated`, err)
    throw err
  }
}

main()
