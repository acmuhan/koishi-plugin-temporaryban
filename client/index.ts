import { Context } from '@koishijs/client'
import Page from './page.vue'

export default (ctx: Context) => {
  ctx.page({
    name: '临时封禁',
    path: '/temporaryban',
    component: Page,
  })
}
