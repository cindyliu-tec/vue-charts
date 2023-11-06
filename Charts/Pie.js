import { mapGetters } from 'vuex'
import formatPercent from '@/utils/formatPercent'
import formatNumber from '@/utils/formatNumber'
import * as d3 from 'd3'
import COLOR_PLATE from './color'

const colorCount = COLOR_PLATE.length

const pie = d3.pie().value(d => d.count).sortValues(() => 1)

export default {
  props: {
    title: {
      type: String,
      default: '',
    },
    sourceData: {
      type: Array,
      required: true,
    },
    keyParam: {
      type: String,
      default: 'item',
    },
    valueParam: {
      type: String,
      default: 'count',
    },
    loading: Boolean,
    height: {
      type: Number,
      default: 340,
    },
    width: {
      type: Number,
      default: 700,
    },
    staticSize: {
      type: Boolean,
      default: false,
    },
    desc: {
      type: String,
      default: '',
    },
    titleDraggable: {
      type: Boolean,
      default: false,
    },
    forceRelayoutLabels: {
      type: Boolean,
      default: false,
    },
  },

  data() {
    return {
      chartHide: true,
      fitWidth: this.width,
    }
  },

  computed: {
    ...mapGetters(['weak']),
    radius() {
      return Math.min(this.height, this.fitWidth) * 0.5 - 50
    },
    arc() {
      return d3.arc()
        .innerRadius(this.radius * 0.6)
        .outerRadius(this.radius)
    },
  },
  watch: {
    sourceData(val) {
      if (!val || val.length === 0) {
        this.chartHide = true
        return
      }
      this.chartHide = false
      this.renderArc()
    },
  },
  methods: {
    initEvents() {
      const pieSvgParentDiv = this.$refs.pieChart

      d3.select(pieSvgParentDiv).selectAll('g.d3-pie-arc>path,g.d3-pie-arc .d3-pie-title').on('click', (e) => {
        const target = e.target
        const index = +target.getAttribute('index')
        if (isNaN(index)) return
        const { sourceData, } = this
        this.$emit('arc-click', sourceData[index])
      })
    },
    relayoutLabelsIfNeeded() {
      const { forceRelayoutLabels, } = this
      if (!forceRelayoutLabels) return
      const splitAllLabels = () => {
        const leftLabels = []
        const rightLabels = []
        const pieSvgParentDiv = this.$refs.pieChart
        // const lines = d3.select(pieSvgParentDiv).selectAll('g.d3-pie-arc line.relayout-line')
        const texts = d3.select(pieSvgParentDiv).selectAll('g.d3-pie-arc text.relayout-text')
        texts.nodes().forEach(n => {
          const pos = n.getAttribute('transform').match(/-?[0-9.]+/g)
          const [x, y] = pos
          const { width: w, height: h, } = n.getBBox()
          if (x < 0) leftLabels.push({ n, x: +x, y: +y, w: +w, h: +h, })
          else rightLabels.push({ n, x: +x, y: +y, w: +w, h: +h, })
        })
        return [leftLabels, rightLabels]
      }
      let [leftLabels, rightLabels] = splitAllLabels()
      const sorter = (a, b) => a.y - b.y
      // 按y升序
      leftLabels = leftLabels.sort((a, b) => -sorter(a, b))
      rightLabels = rightLabels.sort(sorter)

      const collisionDetect = (rect1, rect2) => (
        rect1.x < rect2.x + rect2.w &&
        rect1.x + rect1.w > rect2.x &&
        rect1.y < rect2.y + rect2.h &&
        rect1.y + rect1.h > rect2.y
      )
      // 找出leftLabels/rightLabels中出现重叠的labels [label1, [], [], label2, [], label3,]
      // item为Array是出现重叠的labels组
      // item为Object是没有出现重叠的single label
      const findCollisions = (labels) => {
        if (!labels || labels.length === 0) return []
        if (labels.length === 1) return []
        const collisions = []
        let collision = []
        for (let i = 0; i < labels.length - 1; i += 1) {
          const curr = labels[i]
          const next = labels[i + 1]
          if (collisionDetect(curr, next)) {
            collision = collision.length ? [...collision, next] : [curr, next]
          } else {
            if (collision.length) collisions.push(collision)
            else collisions.push(curr)
            collision = []
          }

          if (i === labels.length - 2) {
            if (collision.length) {
              collisions.push(collision)
              collision = []
            } else {
              collisions.push(next)
            }
          }
        }
        return collisions
      }
      const leftToRearrangeLabels = findCollisions(leftLabels)
      const rightToRearrangeLabels = findCollisions(rightLabels)
      // quick return if no collisions
      if (leftToRearrangeLabels.length === 0 && rightToRearrangeLabels.length === 0) return
      const isLayoutLeftFn = labels => {
        const [first] = labels
        if (Array.isArray(first)) return first[0].x < 0
        return first && first.x < 0
      }
      const tryToFixCollisions = (labelsToRearrange) => {
        if (!labelsToRearrange || labelsToRearrange.length === 0) return
        const pieSvgParentDiv = this.$refs.pieChart
        const root = d3.select(pieSvgParentDiv.querySelector('svg')).node()
        const rootHalfWidth = root.clientWidth / 2
        const minimumSpace = 2
        const isLayoutLeft = isLayoutLeftFn(labelsToRearrange)
        let i = 0
        while (i < labelsToRearrange.length) {
          const labels = labelsToRearrange[i]
          if (!Array.isArray(labels)) {
            i++
            continue
          }
          for (let j = 1; j < labels.length; j++) {
            const prev = labels[j - 1]
            const curr = labels[j]
            const canFixInline = isLayoutLeft
              ? prev.x - prev.w - minimumSpace - curr.w - 6 > -rootHalfWidth
              : prev.x + prev.w + curr.w + minimumSpace + 6 < rootHalfWidth
            if (canFixInline) {
              curr.x = isLayoutLeft
                ? prev.x - prev.w - minimumSpace
                : prev.x + prev.w + minimumSpace
              curr.y = prev.y
            } else {
              curr.y = isLayoutLeft
                ? prev.y - minimumSpace - curr.h
                : prev.y + prev.h + minimumSpace
            }
          }
          const calcLabelsBoundings = labels => {
            labels.x = Math.min(...labels.map(o => o.x))
            labels.y = Math.min(...labels.map(o => o.y))
            labels.w = Math.max(...labels.map(o => o.x + o.w)) - labels.x
            labels.h = Math.max(...labels.map(o => o.y + o.h)) - labels.y
          }
          calcLabelsBoundings(labels)
          // 1. 处理当前labels组溢出surface情况
          const prev = labelsToRearrange[i - 1]
          const isOverflow = r => r.y < -root.clientHeight / 2 + 6 || r.y > root.clientHeight / 2 - r.h
          if (isOverflow(labels)) {
            if (prev) {
              if (Array.isArray(prev)) {
                // merge the `curr` labels in to prev labels and relayout it
                labelsToRearrange.splice(i, 1)
                while (labels.length) {
                  prev.push(labels.shift())
                }
              } else {
                // merge the prev single label in to `labels` and relayout it
                labelsToRearrange.splice(i - 1, 1)
                labels.unshift(prev)
              }
              i--
              continue
            } else {
              // labels is the first label group of current side
              if (isLayoutLeft) {
                const delta = Math.min(
                  root.clientHeight / 2 - labels.h - labels.y,
                  (-root.clientHeight / 2) - labels.y
                )
                labels.forEach(l => (l.y += delta + 6))
              } else {
                const delta = Math.min(
                  labels[0].y - (-root.clientHeight / 2),
                  (labels.y + labels.h) - root.clientHeight / 2
                )
                labels.forEach(l => (l.y -= delta - 6))
              }
              calcLabelsBoundings(labels)
            }
          }
          // 2. 处理当前labels组遮盖next的labels/single label情况
          const next = labelsToRearrange[i + 1]
          if (next && collisionDetect(labels, next)) {
            // merge the next single label in to `labels` and relayout it
            labelsToRearrange.splice(i + 1, 1)
            labels.push(next)
            continue
          }
          i++
        }
      }
      tryToFixCollisions(leftToRearrangeLabels)
      tryToFixCollisions(rightToRearrangeLabels)
      // redraw:
      const labels = [...rightLabels, ...leftLabels]
      const pieSvgParentDiv = this.$refs.pieChart
      const lines = d3.select(pieSvgParentDiv).selectAll('g.d3-pie-arc line.relayout-line')
      const texts = d3.select(pieSvgParentDiv).selectAll('g.d3-pie-arc text.relayout-text')
      const linesHover = d3.select(pieSvgParentDiv).selectAll('g.d3-pie-arc line.relayout-line-hover')
      const textsHover = d3.select(pieSvgParentDiv).selectAll('g.d3-pie-arc text.relayout-text-hover')
      lines.nodes().forEach((l, i) => {
        l.setAttribute('x2', labels[i].x)
        l.setAttribute('y2', labels[i].y)
      })
      linesHover.nodes().forEach((l, i) => {
        l.setAttribute('x2', labels[i].x)
        l.setAttribute('y2', labels[i].y)
        const color = d3.color(COLOR_PLATE[i % colorCount])
        l.setAttribute('stroke', color)
        if (l.previousSibling && l.previousSibling.previousSibling) l.previousSibling.previousSibling.setAttribute('stroke', color)
      })
      texts.nodes().forEach((t, i) => {
        t.setAttribute('transform', `translate(${labels[i].x} ${labels[i].y})`)
      })
      textsHover.nodes().forEach((t, i) => {
        t.setAttribute('transform', `translate(${labels[i].x} ${labels[i].y})`)
      })
    },
    renderArc() {
      const totalCount = this.sourceData.reduce((sum, d) => sum + d.count, 0)
      const reachLegendCountLimit = this.sourceData.length > 48
      const pieTpl = `
        <svg width="100%" height=${this.height}>
          <g class="pie-main">
            ${
              pie(this.sourceData).map((d, i) => {
                const color = d3.color(COLOR_PLATE[d.index % colorCount])
                const middlePoint = this.arc.centroid(d)
                const midAngle = Math.atan2(middlePoint[1], middlePoint[0])
                const absMidAngle = Math.abs(midAngle)
                const startX = Math.cos(midAngle) * this.radius * 0.9
                const startY = Math.sin(midAngle) * this.radius * 0.9
                const endX = startX + Math.cos(midAngle) * 30
                const endY = startY + Math.sin(midAngle) * 30
                const labelX = endX > 0 ? (endX + 20) : (endX - 20)
                let labelY = endY
                let addY = 0
                if (absMidAngle > Math.PI * 0.25 && absMidAngle < Math.PI * 0.75) {
                  if (absMidAngle < Math.PI * 0.5) {
                    addY = Math.tan(absMidAngle - Math.PI * 0.25) * 20
                    labelY = midAngle > 0 ? endY + addY : endY - addY
                  } else {
                    addY = Math.tan(absMidAngle - Math.PI * 0.75) * 20
                    labelY = midAngle > 0 ? endY - addY : endY + addY
                  }
                }
                return `
                  <g class="d3-pie-arc">
                    <path index="${i}" d=${this.arc(d)} fill="${color.copy({ opacity: 0.7, })}" stroke='none'></path>
                    <g>
                      ${ !reachLegendCountLimit ? `
                        <line class="d3-pie-line" stroke='#ccc'
                          x1=${startX}
                          y1=${startY}
                          x2=${endX}
                          y2=${endY}>
                        </line>
                        <line class="d3-pie-line relayout-line" stroke='#ccc'
                          x1=${endX}
                          y1=${endY}
                          x2=${labelX}
                          y2=${labelY}>
                        </line>
                        <text class="d3-pie-text relayout-text"
                          style="text-anchor: ${startX < 0 ? 'end' : 'start'}"
                          transform="translate(${labelX},${labelY})"
                          dx=${startX < 0 ? -6 : 6}
                          dy="0.4em"
                          fill='currentColor'>
                          ${d.data.item}
                        </text>
                      ` : '' }
                      
                      <g class="d3-pie-text-hover">
                        <line stroke='#ccc'
                          x1=${startX}
                          y1=${startY}
                          x2=${endX}
                          y2=${endY}>
                        </line>
                        <line stroke='#ccc' class="relayout-line-hover"
                          x1=${endX}
                          y1=${endY}
                          x2=${labelX}
                          y2=${labelY}>
                        </line>
                        <text class="d3-pie-title relayout-text-hover"
                          style="text-anchor: ${startX < 0 ? 'end' : 'start'}"
                          transform="translate(${labelX},${labelY})"
                          dx=${startX < 0 ? -6 : 6}
                          dy="0.4em"
                          fill="${color}"
                          index="${i}">
                          ${d.data.item}
                        </text>
                        <text class="d3-pie-count"
                          style="text-anchor: middle"
                          fill="${color}">
                          <tspan y="-0.4em">${formatPercent(d.data.count / totalCount, false)}</tspan>
                          <tspan x="0" y="1em">${formatNumber(d.data.count)}</tspan>
                        </text>
                      </g>
                    </g>
                  </g>
                `
              }).join('')
            }
          </g>
        </svg>
      `
      this.$refs.pieChart.innerHTML = pieTpl
      this.initEvents()
      this.$nextTick(() => this.relayoutLabelsIfNeeded())
    },
  },
  render(h) {
    return (
    <div class="chart-wraper pie-chart-container">
      <div class={['title', this.titleDraggable ? 'title-draggable' : null]}>
        { this.titleDraggable && <a-icon type="drag" style="font-size: 16pt;margin-right: 8px" />}
        { this.title }
        <a-tooltip v-show={this.desc}>
          <template slot="title">
            <span>{this.desc}</span>
          </template>
          <a-icon type="question-circle" />
        </a-tooltip>
      </div>
      <a-icon v-show={this.loading} type="sync" spin class="loadingStyle" />
      <div v-show={!this.chartHide} class="d3-pie-container" ref="pieChart">
      </div>
      <div v-show={this.chartHide} style={{ height: this.height + 'px', 'line-height': this.height + 'px', }} class="chart-nodata">NO DATA</div>
    </div>
    )
  },
}
