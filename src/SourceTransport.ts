import { Response } from '@paperback/types'
import { HtmlReader } from './HtmlReader'

/** Normal HTTPS requests with bounded caching; verification is completed in the app browser. */
export abstract class SourceTransport extends HtmlReader {
    private blockedUntil = 0
    private responses = new Map<string, { body: string; expires: number }>()
    private pending = new Map<string, Promise<string>>()

    protected observeResponse(_response: Response, _url: string): void {}
    protected allowedRequest(url: string): boolean { return url.startsWith(this.domain + '/') }
    protected async request(url: string, method = 'GET', data?: string, headers: Record<string, string> = {}, cache = true): Promise<string> {
        if (!this.allowedRequest(url)) throw new Error('Unexpected request host.')
        if (Date.now() < this.blockedUntil) throw new Error(`${this.label}: rate limited. Wait a minute before retrying.`)
        const key = method + ' ' + url
        if (method === 'GET' && cache) {
            const cached = this.responses.get(key)
            if (cached && cached.expires > Date.now()) return cached.body
            const pending = this.pending.get(key)
            if (pending) return pending
        }
        const operation = (async () => {
            const response = await this.requestManager.schedule(App.createRequest({ url, method, data, headers: {
                referer: this.domain + '/', 'user-agent': await this.requestManager.getDefaultUserAgent(), ...headers
            } }), 1)
            this.observeResponse(response, url)
            const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '')
            if (response.status === 429) {
                this.blockedUntil = Date.now() + 60000
                throw new Error(`${this.label}: HTTP 429. Wait a minute before retrying.`)
            }
            if (response.status === 403 || /<title[^>]*>\s*Just a moment|cf-chl-|challenge-platform\/h\//i.test(body)) {
                throw new Error(`${this.label}: browser verification required. Open the source in the app browser, verify access, then retry.`)
            }
            if (response.status !== 200) throw new Error(`${this.label}: HTTP ${response.status}. Please retry later.`)
            if (method === 'GET' && cache) {
                if (this.responses.size >= 8) this.responses.delete(this.responses.keys().next().value as string)
                this.responses.set(key, { body, expires: Date.now() + 30000 })
            }
            return body
        })()
        if (method === 'GET' && cache) this.pending.set(key, operation)
        try { return await operation } finally { this.pending.delete(key) }
    }
    protected override async fetch(url: string): Promise<string> { return this.request(url) }
    async getCloudflareBypassRequestAsync() {
        return App.createRequest({ url: this.domain + '/', method: 'GET', headers: { 'user-agent': await this.requestManager.getDefaultUserAgent() } })
    }
}
