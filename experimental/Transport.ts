import { HtmlReader } from '../src/HtmlReader'
import { Response } from '@paperback/types'

/** Draft transport: normal session verification only; no challenge-solving or retry evasion. */
export abstract class ExperimentalReader extends HtmlReader {
    private blockedUntil = 0
    protected async request(url: string, method = 'GET', data?: string, headers: Record<string, string> = {}): Promise<string> {
        if (Date.now() < this.blockedUntil) throw new Error('Rate limited. Wait a minute before retrying.')
        if (!this.allowedRequest(url)) throw new Error('Unexpected request host.')
        const response = await this.requestManager.schedule(App.createRequest({
            url, method, data, headers: {
                referer: this.domain + '/', 'user-agent': await this.requestManager.getDefaultUserAgent(), ...headers
            }
        }), 1)
        if (response.status === 429) this.blockedUntil = Date.now() + 60000
        const html = response.data ?? ''
        if (response.status === 403 || response.status === 503 || /cf-chl-|Just a moment|challenge-platform\/h\//i.test(html)) {
            throw new Error(`${this.label}: browser verification required. Open this source in the app's browser and verify access, then retry.`)
        }
        if (response.status !== 200) throw new Error(`${this.label}: HTTP ${response.status}`)
        this.observeResponse(response, url)
        return html
    }
    protected allowedRequest(url: string): boolean { return url.startsWith(this.domain + '/') }
    protected observeResponse(_response: Response, _url: string): void {}
    protected override async fetch(url: string): Promise<string> { return this.request(url) }
    async getCloudflareBypassRequestAsync() {
        return App.createRequest({ url: this.domain + '/', method: 'GET', headers: { 'user-agent': await this.requestManager.getDefaultUserAgent() } })
    }
}
