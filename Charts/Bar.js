import { mapGetters } from 'vuex'
import * as d3 from 'd3'
import { debounce } from 'lodash'
import formatNumber from '@/utils/formatNumber'
import COLOR_PLATE from './color'

const MouseEventsMixin = {
  data: () => ({
    multiRectID: String(Math.random()).slice(-5),
  }),
  _hoverIndex: -1,
  methods: {
    onMounted() {
      const { multiRectID, } = this
      d3.selectAll(`rect.multi-rect-${multiRectID}`).on('mousemove', (e) => {
        const dom = e.target
        const index = +dom.getAttribute('row')
        if (isNaN(index) || index < 0) {
          return
        }
        this._hoverIndex = index
        d3.select(`.connection-${multiRectID}-${index}`).style('display', 'block')

        this.onLocalMouseEnterWrapper(dom, e)
      }).on('mouseleave', (e) => {
        const { multiRectID, } = this
        const dom = e.target
        if (this._hoverIndex !== -1 && !isNaN(this._hoverIndex)) {
          d3.select(`.connection-${multiRectID}-${this._hoverIndex}`).style('display', 'none')
          this.hoverIndex = -1
        }
        // perf: if toElement is also rect ignore it!
        const toElement = e.toElement
        if (toElement && toElement.classList && toElement.classList.contains(`multi-rect-${multiRectID}`)) return

        this.onLocalMouseLeaveWrapper(dom, e)
      }).on('click', (e) => {
        const { tooltipColIndex: col, _hoverIndex: row, } = this
        if (col === -1 || row === -1) return
        this.$emit('rect-click', col, row)
      })
    },
  },
}
const TooltipMixin = {
  data: () => ({
    tooltipColIndex: -1,
  }),
  computed: {
    tooltipID() {
      const { multiRectID, } = this
      return 'tooltip-' + multiRectID
    },
    currentTooltipTitle() {
      const { tooltipColIndex, sourceData, } = this
      return tooltipColIndex === -1 ? '' : sourceData[tooltipColIndex].x
    },
    currentTooltipList() {
      const { tooltipColIndex, sourceData, } = this
      if (tooltipColIndex === -1) return []
      const { y, } = sourceData[tooltipColIndex]
      return y.map((it, i) => {
        return {
          label: it.label,
          value: it.value,
          color: COLOR_PLATE[i % COLOR_PLATE.length],
        }
      })
    },
  },
  mounted() {
    this.onLocalMouseEnterWrapper = debounce(this.onLocalMouseEnter, 1000 / 60)
    this.onLocalMouseLeaveWrapper = debounce(this.onLocalMouseLeave, 1000 / 60)
  },
  methods: {
    onLocalMouseEnter(dom, e) {
      const { tooltipID, } = this
      const col = +dom.getAttribute('col')
      this.tooltipColIndex = col
      const { offsetX, offsetY, } = e
      d3.select(`#${tooltipID}`)
        .style('transform', `translate(${offsetX + 45}px, ${offsetY + 45}px)`)
        .style('display', 'block')
    },
    onLocalMouseLeave(dom, e) {
      const { tooltipID, } = this
      if (this.tooltipColIndex >= 0) {
        this.tooltipColIndex = -1
        d3.select(`#${tooltipID}`).style('display', 'none')
      }
    },
    renderTooltip(h) {
      const { currentTooltipTitle, currentTooltipList, tooltipID, } = this
      return (
        <div id={tooltipID} class="d3-tooltip" style={{ zIndex: 1, transition: 'transform .15s', top: '0px', left: '0px', }}>
          <div class="d3-tooltip-title" style="margin-bottom: 4px;">
            {currentTooltipTitle}
          </div>
          <ul class="d3-tooltip-list">
            {
              currentTooltipList.reverse().map(i => <li><span class="d3-legend-circle" style={{ backgroundColor: i.color, }}></span>{i.label}: {i.value}</li>)
            }
          </ul>
        </div>
      )
    },
  },
}
export default {
  name: 'Bar',
  props: {
    title: {
      type: String,
      default: '',
    },
    loading: Boolean,
    sourceData: {
      type: Array,
      default: () => {
        return []
      },
    },
    width: {
      type: Number,
      default: 700,
    },
    height: {
      type: Number,
      default: 270,
    },
    padding: {
      type: Array,
      default: () => [16, 16, 32, 42], // t,r,b,l
    },
  },
  mixins: [MouseEventsMixin, TooltipMixin],
  computed: {
    ...mapGetters(['weak']),
    xScale() {
      return d3.scaleBand()
      .domain(this.sourceData.map(d => d.x))
      .range([this.padding[3], this.fitWidth - this.padding[1]])
      .padding(0.5)
    },
    yScale() {
      const { isMultiRect, } = this
      const maxDot = Math.max(...this.sourceData.map(d => isMultiRect ? d.sumY : d.y))
      return d3.scaleLinear()
      .domain([0, maxDot]).nice(5)
      .range([this.fitHeight - this.padding[2], this.padding[0]])
    },
    isMultiRect() {
      const { sourceData, } = this
      if (!sourceData || sourceData.length === 0) return false
      const { y: firstY, } = sourceData[0]
      return Array.isArray(firstY)
    },
  },
  data() {
    return {
      fitWidth: this.width,
      fitHeight: this.height,
      chartHide: true,
    }
  },
  watch: {
    sourceData() {
      this.observeSourceData()
    },
  },
  methods: {
    observeSourceData() {
      if (!this.sourceData || this.sourceData.length === 0) {
        this.chartHide = true
        return
      }
      this.chartHide = false
      this.renderChart()
    },
    renderChart() {
      if (!this.fitWidth) return
      requestAnimationFrame(() => {
        if (!this.$refs.barChart) return
        this.$refs.barChart.innerHTML = `
          <svg viewBox="0 0 ${this.fitWidth} ${this.fitHeight}" width="100%" height=${this.fitHeight}>
            ${this.renderxAxios()}
            ${this.renderyAxios()}
            ${this.renderBar()}
          </svg>
        `
        // this is the timing which we can attach the interaction events
        this.onMounted()
      })
    },
    // 单个rect渲染
    renderSingleBar(color, d) {
      const { xScale: x, yScale: y, } = this
      return `
        <rect
          fill='${color}'
          x='0'
          y='${y(d.y)}'
          width='${x.bandwidth()}'
          height='${y(0) - y(d.y)}'>
        </rect>
      `
    },
    // 多个rect渲染
    renderMultiBar(d/* Array */, i, xOffset) {
      const { xScale: x, yScale: y, } = this
      let yOffset = 0

      return `
        <g class="d3-bar-item-multi">
          ${
            d.y.map((item, index) => {
              const xPos = 0
              const yPos = y(item.value) - yOffset
              const width = x.bandwidth()
              const height = y(0) - y(item.value)

              const pointPair = [
                [ xPos + xOffset, yPos ], // lt
                [ xPos + xOffset, yPos + height ], // lb
                [ xPos + width + xOffset, yPos ], // rt
                [ xPos + width + xOffset, yPos + height ] // rb
              ]
              this._cachedConnectionPoints[`${i},${index}`] = pointPair

              const dom = `
                <rect
                  class='multi-rect-${this.multiRectID}'
                  row='${index}'
                  col='${i}'
                  fill='${COLOR_PLATE[index % COLOR_PLATE.length]}'
                  x='${xPos}'
                  y='${yPos}'
                  width='${width}'
                  height='${height}' />
              `
              yOffset += height
              return dom
            }).join('')
          }
        </g>
      `
    },
    // multiRect模式下渲染react之间的连接线
    renderMultiConnections() {
      const { sourceData, isMultiRect, } = this
      if (!isMultiRect) return ''
      if (!this._cachedConnectionPoints) return
      const rows = sourceData[0].y.length
      const cols = sourceData.length

      const result = []
      for (let i = 0; i < rows; i++) {
        result.push(`<g class='connection-${this.multiRectID}-${i}' style='display: none;'>`)
        for (let j = 1; j < cols; j++) {
          const prev = this._cachedConnectionPoints[`${j - 1},${i}`]
          const curr = this._cachedConnectionPoints[`${j},${i}`]
          const borderColor = COLOR_PLATE[i % COLOR_PLATE.length]
          const fillColor = d3.color(borderColor).copy({ opacity: 0.1, })

          const [lt, lb] = prev.slice(-2)
          const [rt, rb] = curr.slice(0, 2)
          // == for debugging ==
          const DEBUG = false
          if (i === 0 && DEBUG) {
            result.push(`
              <circle cx='${lt[0]}' cy='${lt[1]}' r='2' fill='red' />
              <circle cx='${lb[0]}' cy='${lb[1]}' r='2' fill='red' />
              <circle cx='${rt[0]}' cy='${rt[1]}' r='2' fill='blue' />
              <circle cx='${rb[0]}' cy='${rb[1]}' r='2' fill='blue' />
            `)
          }
          result.push(`
            <path d='M${lt[0]} ${lt[1]} L${lb[0]} ${lb[1]} L${rb[0]} ${rb[1]} L${rt[0]} ${rt[1]}Z' fill='${fillColor}' stroke='${borderColor}' />
          `)
        }
        result.push('</g>')
      }
      return result.join('')
    },
    renderBar() {
      const x = this.xScale
      const y = this.yScale
      const color = COLOR_PLATE[0]
      const bgcolor = d3.color(color).copy({ opacity: 0.1, })
      const { isMultiRect, } = this

      this._cachedConnectionPoints = {}// @see this.renderMultiConnections()
      return `
        <g id='barsParentGroup'>
          ${
            this.sourceData.map((d, i) => `
              <g transform='translate(${x(d.x)}, 0)' class='d3-bar-item'>
                <rect
                  class='d3-bar-bg'
                  fill='${bgcolor}'
                  x='0'
                  y='${this.padding[0]}'
                  width='${x.bandwidth()}'
                  height='${y(0) - this.padding[0]}'>
                </rect>
                <text class='d3-bar-count' fill='currentColor' x='${x.bandwidth() / 2}' y='${y(isMultiRect ? d.sumY : d.y) - 8}' style='text-anchor: middle'>${formatNumber(isMultiRect ? d.sumY : d.y, false, 5)}</text>
                ${
                  isMultiRect
                    ? this.renderMultiBar(d, i, x(d.x))
                    : this.renderSingleBar(color, d)
                }
              </g>
            `).join('')
          }
          ${
            isMultiRect
              ? this.renderMultiConnections()
              : ''
          }
        </g>
      `
    },
    renderxAxios() {
      const x = this.xScale
      const xAxis = g => g
      .attr('transform', `translate(0, ${this.fitHeight - this.padding[2]})`)
      .attr('class', 'bar-chart-xAxios')
      .call(d3.axisBottom(x)
        .tickSize(0).tickPadding(12))
      .call(g => g.select('.domain').attr('display', 'none'))
      .call(g => g.selectAll('.tick line').attr('stroke-opacity', 0.1).attr('y1', this.padding[0] + this.padding[2] - this.fitHeight))

      return d3.create('g').call(xAxis).node().outerHTML
    },
    renderyAxios() {
      const y = this.yScale
      const yAxis = g => g
      .attr('transform', `translate(${this.padding[3]}, 0)`)
      .call(d3.axisLeft(y).ticks(5, '~s'))
      .call(g => g.select('.domain').attr('display', 'none'))
      .call(g => g.selectAll('.tick line').attr('stroke-opacity', 0.1).attr('x2', this.fitWidth - this.padding[1] - this.padding[3]))

      return d3.create('g').call(yAxis).node().outerHTML
    },
    observerContainer() {
      this.containerObserver = new ResizeObserver(debounce(entries => {
        entries.forEach(entry => {
          const newWidth = Math.round(entry.contentRect.width)
          if (newWidth !== this.fitWidth) {
            this.fitWidth = newWidth
            if (!this.chartHide) {
              this.renderChart()
            }
          }
        })
      }, 300))
      if (!this.staticSize) {
        this.containerObserver.observe(this.$refs.barChart)
      }
    },
  },
  mounted() {
    this.observeSourceData()
    this.fitWidth = Math.round(this.$refs.barChart.clientWidth)
    this.observerContainer()
  },
  beforeDestroy() {
    this.containerObserver.disconnect()
  },
  render(h) {
    return (
    <div class={`bar-chart-container ${this.weak ? 'weak' : 'light'}`}>
      <div class="title">{this.title}</div>
      <a-icon v-show={this.loading} type="sync" spin class="loadingStyle" />
      <div v-show={!this.chartHide} class="d3-bar-container" ref="barChart">
      </div>
      {this.renderTooltip(h)}
      <div v-show={this.chartHide} style={{ height: this.height + 'px', 'line-height': this.height + 'px', }} class="chart-nodata">NO DATA</div>
    </div>

    )
  },
}
