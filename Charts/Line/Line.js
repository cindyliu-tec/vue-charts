import moment from 'moment'
import { mapGetters } from 'vuex'
import * as d3 from 'd3'
import { debounce } from 'lodash'
import formatNumber from '@/utils/formatNumber'

export default {
  props: {
    height: {
      type: Number,
      default: 225,
      required: true,
    },
    width: {
      type: Number,
      default: 700,
    },
    padding: {
      type: Array,
      default: () => [16, 16, 32, 42], // t,r,b,l
    },
    data: {
      require: true,
      type: Array,
      default: () => [],
    },
    xaxisParam: {
      type: String,
      default: 'timestamp',
    },
    yFormatter: {
      type: Function,
      default: formatNumber,
    },
    xformatter: {
      type: Function,
      default: val => val,
    },
    filteredLegend: {
      type: String,
      default: '',
    },
    hasPointer: {
      type: Boolean,
      default: true,
    },
    xStep: {
      type: Number,
      default: 15,
    },
    xRange: {
      type: Array,
      default: () => [0, 0],
    },
    staticSize: {
      type: Boolean,
      default: false,
    },
    legendWidth: {
      type: [Number, String],
      default: '25%',
    },
    legendHeight: {
      type: Number,
      default: 48,
    },
    legendPosition: {
      type: String,
      default: 'bottom',
    },
    showLegend: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      fitWidth: this.width,
      fitHeight: this.height,
      pointerLines: null,
      randomId: 'svgrid' + String(Math.random()).slice(2, 7),
      tooltip: {
        items: [],
      },
      chartHide: true,
      curLegend: '',
      LineData: [],
      legendData: [],
      dispatchPointerX: debounce((val) => {
        this.$store.dispatch('global/changeLineChartPinterX', val)
      }, 10),
      tooltiplock: false,
      tooltipCache: {},
    }
  },
  render(h) {
    return (
      <div class={`d3-line-chart ${this.weak ? 'weak' : 'light'}`} id={this.randomId}>
        <div style={{ display: this.chartHide ? 'none' : 'block', position: 'relative', }}>
          <svg class="chart-overlay" viewBox={`0 0 ${this.fitWidth} ${this.fitHeight}`} width={this.fitWidth} height={this.fitHeight}></svg>
          <svg class="chart" viewBox={`0 0 ${this.fitWidth} ${this.fitHeight}`} width={this.fitWidth} height={this.fitHeight}>
            <g class='d3-lines'></g>
            <g class='d3-xAxios'></g>
            <g class='d3-yAxios'></g>
            <path class="linechart-pointer-line" d={`M0,10L0,${this.fitHeight - this.padding[2] + 5}`} fill='none' stroke='#f00' stroke-width='1' display='none' transform="translate(-1000, 0)" />
          </svg>
          <div v-show={this.showLegend} attrs={{
            class: this.legendPosition === 'right' ? 'd3-legend-right' : this.legendPosition === 'left' ? 'd3-legend-left' : 'd3-legend',
            style: this.legendPosition === 'right' || this.legendPosition === 'left' ? `width: ${/^[0-9.]+$/.test(this.legendWidth) ? this.legendWidth + 'px' : this.legendWidth}` : `height: ${this.legendHeight}px`,
          }}>
          {
            this.legendData.map((item, i) => (
              <div class="d3-legend-item" onClick={this.clickLegend.bind(this, item)} onMouseenter={this.mouseEnterLegend.bind(this, item)} onMouseleave={this.mouseLeaveLegend.bind(this, item)}>
                <span class="d3-legend-circle" style={`background-color:${ !this.curLegend || this.curLegend === item.label ? (item.color) : '#ccc'}`}></span>
                {item.label}
              </div>
            ))
          }
          </div>
          <div class="d3-tooltip" ref="tooltip" style={{ zIndex: this.tooltiplock ? 1 : 0, }}>
            <div class="d3-tooltip-title" style="margin-bottom: 4px;">
              {this.tooltip.items.length > 0 ? moment(this.tooltip.items[0].timestamp).format('YYYY-MM-DD HH:mm:ss') : ''}
            </div>
            <ul class="d3-tooltip-list">
              {
                this.tooltip.items.map(item => {
                  return (<li>
                    <span class="d3-legend-circle" style={`background-color:${item.color}`}></span>
                    {item.label}: {item.dotValue}
                    </li>)
                })
              }
            </ul>
          </div>
        </div>
        { this.chartHide ? <div style={{ height: this.fitHeight + this.legendHeight + 'px', 'line-height': this.fitHeight + this.legendHeight + 'px', }} class="chart-nodata">NO DATA</div> : '' }
      </div>
    )
  },
  mounted() {
    this.chart = d3.select('#' + this.randomId)
    this.svg = this.chart.select('svg.chart')
    this.svglines = this.svg.select('g.d3-lines')
    this.svgxAxios = this.svg.select('g.d3-xAxios')
    this.svgyAxios = this.svg.select('g.d3-yAxios')
    this.svgPointerLine = this.svg.select('path.linechart-pointer-line')

    const clientWidth = this.chart._groups[0][0].clientWidth
    this.fitWidth = this.computeChartFitWidth(clientWidth)
    this.fitHeight = this.legendPosition === 'right' || this.legendPosition === 'left' ? this.height + this.legendHeight : this.height

    this.initEvents()
    this.observerContainer()
  },
  watch: {
    data(val, oval) {
      this.tooltipCache = {}
      if (val.length === 0) {
        this.chartHide = true
        return
      }
      if (val.map(m => m.label).sort().join() !== oval.map(m => m.label).sort().join()) {
        this.curLegend = ''
      }
      this.chartHide = false
      this.LineData = val.filter(d => !this.curLegend || d.label === this.curLegend)
      this.legendData = val
      this.renderChart()
    },
    lineChartPinterX(val) {
      if (this.tooltiplock) return
      const rect = this.chart._groups[0][0].getBoundingClientRect()
      if (val && (this.mouseIn || this.data.length === 0 || this.chartHide || window.innerHeight < rect.top || rect.height + rect.top < 0)) return
      if (val) {
        if (!this.isShowTooltip) {
          this.showTooltip()
        }
        this.changeTooltipByxValue(val)
      } else {
        this.hideTooltip()
      }
    },
    filteredLegend(val) {
      this.curLegend = val
    },
    curLegend(val) {
      this.LineData = this.data.filter(d => !val || d.label === val)
      this.renderyAxios()
      this.renderLine()
    },
    legendPosition(val) {
      if (this.data.length === 0) return
      const clientWidth = this.chart._groups[0][0].clientWidth - 12 * 2
      this.fitWidth = this.computeChartFitWidth(clientWidth)
      this.fitHeight = this.legendPosition === 'right' || this.legendPosition === 'left' ? this.height + this.legendHeight : this.height

      this.renderChart()
      this.resizeOverlay()
    },
  },
  computed: {
    ...mapGetters(['weak', 'lineChartPinterX']),
    xScale() {
      return d3.scaleTime()
      .domain(this.xRange)
      .range([this.padding[3], this.fitWidth - this.padding[1]])
    },
    yScale() {
      // if (this.LineData.length === 0) return
      const arrMax = (arr, param) => arr.reduce((p, n) => { return p < n[param] ? n[param] : p }, 0)

      const maxDot = Math.max(this.LineData.reduce((p, n) => {
        const nv = arrMax(n.dots, 'dotValue')
        return p < nv ? nv : p
      }, 0))

      return d3.scaleLinear()
      .domain([0, maxDot < 1 ? 1 : maxDot]).nice(5)
      .range([this.fitHeight - this.padding[2], this.padding[0]])
    },
    bisect() {
      const bisect = d3.bisector(d => d.timestamp).left
      return mx => {
        if (this.tooltipCache[mx] && !this.curLegend) return this.tooltipCache[mx]
        const timestamp = this.xScale.invert(mx)
        const items = this.LineData
          .map(line => {
            const data = line.dots
            const index = bisect(data, timestamp, 1)
            const a = data[index - 1]
            const b = data[index]
            const target = b && (timestamp - a.timestamp > b.timestamp - timestamp) ? b : a
            return Object.assign({}, target, {
              color: line.color,
              label: line.label,
              dotValue: this.yFormatter ? this.yFormatter(target.dotValue) : formatNumber(target.dotValue),
              originValue: target.dotValue,
            })
          })
        const result = {
          timestamp,
          items: items.length > 3 ? items.sort((a, b) => a.originValue > b.originValue ? -1 : 1) : items,
        }
        if (!this.curLegend) {
          this.tooltipCache[mx] = result
        }
        return result
      }
    },
  },
  methods: {
    renderChart() {
      const margins = this.legendPosition === 'left' ? `0 0 0 ${this.legendWidth}` : this.legendPosition === 'right' ? `0 ${this.legendWidth} 0 0` : '0px'
      d3.select('#' + this.randomId + ' .chart-overlay').style('margin', margins)
      d3.select('#' + this.randomId + ' .chart').style('margin', margins)

      requestAnimationFrame(() => {
        this.renderxAxios()
        this.renderyAxios()
        this.renderLine()
      })
    },
    linePath(data) {
      const x = this.xScale
      const y = this.yScale
      let path = `M${x(data[0].timestamp)},${y(data[0].dotValue)}`
      for (let i = 1; i < data.length; ++i) {
        path += `L${x(data[i].timestamp)},${y(data[i].dotValue)}`
      }
      return path
    },
    renderLine() {
      const paths = this.LineData
        .map((m, i) => `<path label='${m.label}' d='${this.linePath(m.dots)}' fill='none' stroke='${m.color}' stroke-width='1' stroke-miterlimit='1'></path>`).join('')
      this.svglines.html(paths)
    },
    renderxAxios() {
      const durationSecond = 1e3
      const instervalFn = d3.timeInterval(function(date) {
        date.setTime(date - date.getMilliseconds())
      }, function(date, step) {
        date.setTime(+date + step * durationSecond)
      }, function(start, end) {
        return (end - start) / durationSecond
      })

      const x = this.xScale
      const xAxis = g => g
      .attr('transform', `translate(0, ${this.fitHeight - this.padding[2]})`)
      .call(d3.axisBottom(x)
      .ticks(instervalFn.every(this.xStep)).tickSize(0).tickPadding(12).tickFormat(this.xformatter))
      .call(g => g.select('.domain').attr('display', 'none'))
      .call(g => g.selectAll('.tick line').attr('stroke-opacity', 0.1).attr('y1', this.padding[0] + this.padding[2] - this.fitHeight))

      this.svgxAxios.call(xAxis).node()
    },
    renderyAxios() {
      const y = this.yScale
      const yAxis = g => g
      .attr('transform', `translate(${this.padding[3]}, 0)`)
      .call(d3.axisLeft(y).ticks(5, '~s'))
      .call(g => g.select('.domain').attr('display', 'none'))
      .call(g => g.selectAll('.tick line').attr('stroke-opacity', 0.1).attr('x2', this.fitWidth - this.padding[1] - this.padding[3]))
      this.svgyAxios.call(yAxis).node()
    },
    brushed(e) {
      if (e.selection) {
        const [x0, x1] = e.selection
        this.$emit('brush', {
          xRange: [this.xScale.invert(x0), this.xScale.invert(x1)],
          position: [e.sourceEvent.offsetX, e.sourceEvent.offsetY],
          clientWidth: this.fitWidth,
        })
      }
    },
    initEvents() {
      this.brush = d3.brushX().extent([[this.padding[3], this.padding[0]], [this.fitWidth - this.padding[1], this.fitHeight - this.padding[2]]])

      this.overlay = d3.select('#' + this.randomId + ' .chart-overlay')
      this.overlay.append('g').call(this.brush
        .on('start', () => {
          if (!this.svgBrush) this.svgBrush = d3.select('#' + this.randomId + ' rect.selection')
          this.svgBrush.attr('display', 'block')
        })
        .on('end', (e) => {
          this.brushed(e)
          this.svgBrush.attr('display', 'none')
        }))

      let mouseX = null

      this.overlay.select('.overlay')
        .on('click', (e) => {
          this.tooltiplock = true
          e.stopPropagation()
        })
        .on('dblclick', (e) => {
          this.tooltiplock = false
          this.$emit('dblclick', this.curTimestamp || this.xScale.invert(e.offsetX))
          e.stopPropagation()
        })
        .on('mouseenter', () => {
          if (this.tooltiplock) return
          this.mouseIn = true
          this.showTooltip()
        })
        .on('mousemove', (e) => {
          if (!this.isShowTooltip) this.showTooltip()
          if (this.tooltiplock) return
          const offsetX = e.offsetX
          if (offsetX === mouseX) return
          mouseX = offsetX
          this.changeTooltip(offsetX)
        })
        .on('mouseout', () => {
          if (!this.tooltiplock) {
            this.hideTooltip()
            this.mouseIn = false
          }
          this.dispatchPointerX(0)
        })
    },
    changeTooltip(offsetX) {
      requestAnimationFrame(() => {
        this.svgPointerLine.attr('transform', `translate(${offsetX}, 0)`)
        const tooltipContent = this.bisect(offsetX)
        this.curTimestamp = tooltipContent.items[0].timestamp
        if (this.mouseIn) this.dispatchPointerX(tooltipContent.timestamp)
        if (tooltipContent.items.length === 0) return
        this.tooltip = tooltipContent
        if (offsetX > this.fitWidth * 0.7) {
          this.$refs.tooltip.style.left = 'auto'
          this.$refs.tooltip.style.right = this.fitWidth - offsetX + 12 + 'px'
        } else {
          this.$refs.tooltip.style.left = offsetX + 12 + 'px'
          this.$refs.tooltip.style.right = 'auto'
        }
      })
    },
    changeTooltipByxValue(val) {
      this.changeTooltip(Math.round(this.xScale(val)))
    },
    showTooltip() {
      this.isShowTooltip = true
      this.$refs.tooltip.style.display = 'block'
      this.svgPointerLine.attr('display', 'block')
    },
    hideTooltip() {
      this.isShowTooltip = false
      this.$refs.tooltip.style.display = 'none'
      this.svgPointerLine.attr('display', 'none')
    },
    observerContainer() {
      this.containerObserver = new ResizeObserver(debounce(entries => {
        entries.forEach(entry => {
          const newWidth = entry.contentRect.width
          if (newWidth <= 0) return
          if (newWidth !== this.fitWidth) {
            this.fitWidth = this.computeChartFitWidth(newWidth)
            if (!this.chartHide) {
              this.renderChart()
              this.resizeOverlay()
            }
          }
        })
      }, 300))
      if (!this.staticSize) {
        this.containerObserver.observe(this.chart._groups[0][0])
      }
    },
    clickLegend(item) {
      this.curLegend = this.curLegend !== item.label ? item.label : ''
    },
    resizeOverlay() {
      if (!this.overlayG) {
        this.overlayG = this.overlay.select('.overlay')
      }
      this.overlayG.attr('width', this.fitWidth - this.padding[3] - this.padding[1])
    },
    mouseEnterLegend(item) {
      this.svglines.select(`path[label='${item.label}']`)
        .attr('stroke-width', 2)
    },
    mouseLeaveLegend(item) {
      this.svglines.select(`path[label='${item.label}']`)
        .attr('stroke-width', 1)
    },
    computeChartFitWidth(clientWidth) {
      const ma = String(this.legendWidth).match(/^(\d+)%$/)
      const legendWidth = ma ? clientWidth * (ma[1] / 100) : this.legendWidth
      return this.legendPosition === 'right' || this.legendPosition === 'left' ? clientWidth - legendWidth : clientWidth
    },
  },
  beforeDestroy() {
    this.containerObserver.disconnect()
    this.chart = null
    this.svg = null
    this.svglines = null
    this.svgxAxios = null
    this.svgyAxios = null
    this.svgPointerLine = null
    this.overlay = null
  },
}
