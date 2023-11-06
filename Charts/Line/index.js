import LineChart from './Line'
import moment from 'moment'
import { mapGetters } from 'vuex'
import COLOR_PLATE from '../color'
import innerJump from '@/utils/innerJump'
// import AutoMeasureContainer from '@/components/AutoMeasureContainer'

const colorCount = COLOR_PLATE.length

// const data = [
//   { timestamp: 1594982048304, now: 7.0, -1d: 3.9, -7d: 3.9, },
//   { timestamp: 1594982048304, now: 6.9, -1d: 4.2, -7d: 3.9, },
// ]

const axisFormatType = {
  second: 'HH:mm:ss',
  minute: 'HH:mm',
  dayhour: 'M/D HH:mm',
  day: 'M/D',
}

export default {
  components: {
    LineChart,
  },
  props: {
    title: {
      type: String,
      default: '',
    },
    height: {
      type: Number,
      default: 225,
    },
    sourceData: {
      require: true,
      type: Object,
      default: () => ({
        timeStart: 0,
        timeEnd: 0,
        lineLength: 0,
        valueMin: 0,
        valueMax: 0,
        data: [],
      }),
    },
    xaxisParam: {
      type: String,
      default: 'timestamp',
    },
    padding: {
      type: Array,
      default: () => [16, 16, 32, 42], // t,r,b,l
    },
    axisDensity: {
      type: Number,
      default: 5,
    },
    yFormatter: Function,
    loading: {
      type: Boolean,
      default: false,
    },
    filteredLegend: {
      type: String,
      default: '',
    },
    hasPointer: {
      type: Boolean,
      default: true,
    },
    legendPosition: {
      type: String,
      default: 'bottom',
    },
    legendWidth: {
      type: [Number, String],
      default: '25%',
    },
    legendHeight: {
      type: Number,
      default: 48,
    },
    showLegend: {
      type: Boolean,
      default: true,
    },
    brushCbs: {
      type: Array,
      default: () => ([]),
    },
    linkRequest: {
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
  },
  computed: {
    ...mapGetters(['weak']),
    brushOpts() {
      if (this.brushCbs.length > 0) {
        const cbs = this.defaultRangeCbs.concat(this.brushCbs)
        return cbs.map(item => (
          <div class="brush-opt-item" key={item.label} onclick={this.clickRangeOpt.bind(this, item.cb)}>
            <a-button type="link">{item.label}</a-button>
          </div>
        ))
      }
    },
  },
  data() {
    return {
      data: [],
      xformatter: val => val,
      xStep: 15, // 单位秒
      brushedRange: [0, 0],
      brushPositionX: 0,
      defaultRangeCbs: [{
        label: 'change time range',
        cb: this.reRange,
      }],
    }
  },
  watch: {
    sourceData: {
      handler: 'handlerSourceDataChange',
      deep: false,
    },
  },
  methods: {
    handlerSourceDataChange(sourceData) {
      let axisFormat = axisFormatType.minute
      let xStep = 60 // 单位秒
      if (this.xaxisParam === 'timestamp' && sourceData.timeStart < sourceData.timeEnd) {
        const duringSeconds = (sourceData.timeEnd / 1000) - (sourceData.timeStart / 1000)
        const minuteSeconds = 60
        const hourSeconds = 60 * minuteSeconds
        const daySeconds = 24 * hourSeconds
        if (duringSeconds <= 2 * minuteSeconds) {
          axisFormat = axisFormatType.second
          xStep = 15
        } else if (duringSeconds <= 5 * minuteSeconds) {
          axisFormat = axisFormatType.second
          xStep = 60
        } else if (duringSeconds <= 30 * minuteSeconds) {
          xStep = 5 * minuteSeconds
        } else if (duringSeconds <= daySeconds) { // 1h = 10mim * 6
          const times = (duringSeconds / hourSeconds).toFixed(1) * 10
          xStep = minuteSeconds * Math.round(times / 5) * 5
        } else if (duringSeconds <= 3 * daySeconds) { // 1d = 4h * 6
          xStep = Math.round(duringSeconds / daySeconds) * 4 * hourSeconds
          axisFormat = axisFormatType.dayhour
        } else {
          xStep = Math.round(duringSeconds / (3 * daySeconds)) * daySeconds
          axisFormat = axisFormatType.day
        }
      }

      this.xStep = xStep
      this.xformatter = (val) => this.xaxisParam === 'timestamp' ? moment(val).format(axisFormat) : val
      this.data = (sourceData.data || []).map((line, i) => {
        return Object.assign({}, line, {
          color: line.color || this.getColor(i),
        })
      })
    },
    getColor(index) {
      return COLOR_PLATE[index % colorCount]
    },
    onBrush(payload) {
      this.brushedRange = payload.xRange
      if (this.brushCbs.length > 0) {
        this.$refs.bushOpt.style.display = 'block'
        const maxLeft = payload.clientWidth - this.$refs.bushOpt.clientWidth
        this.brushPositionX = Math.min(payload.position[0], maxLeft)
      } else {
        this.reRange()
      }
    },
    reRange() {
      this.$store.dispatch('global/changeDateRange', {
        dateRangeLabel: null,
        dateRange: [moment(this.brushedRange[0]), moment(this.brushedRange[1])],
        refreshLatency: 0,
      })
      this.hideBrushOpt()
    },
    clickRangeOpt(optCallback) {
      this.hideBrushOpt()
      optCallback(this.brushedRange)
    },
    hideBrushOpt() {
      if (!this.$refs.bushOpt) return
      this.$refs.bushOpt.style.display = 'none'
    },
    toRequestList() {
      innerJump('/svr/requestlist', this.brushedRange)
    },
    wraperClick(e) {
      this.$refs.chart.tooltiplock = false
      this.$refs.chart.hideTooltip()
    },
    selectDot(time) {
      this.$emit('selectDot', time)
      if (this.linkRequest) {
        const stamp = time.valueOf()
        this.$router.push(`/svr/requestlist?dateStart=${stamp - 5000}&dateEnd=${stamp + 5000}&innerlink=1`)
      }
    },
  },
  beforeDestroy() {
    this.pointerLines = null
  },
  mounted() {
    this.handlerSourceDataChange(this.sourceData)
  },
  render(h) {
    return (
    <div class="chart-wraper line-chart-container" onclick={this.wraperClick}>
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
      { this.$slots.default || '' }
      { this.loading ? <a-icon type="sync" spin class="loadingStyle" /> : '' }
        <LineChart
          ref="chart"
          height={this.height}
          xaxisParam={this.xaxisParam}
          yFormatter={this.yFormatter}
          xformatter={this.xformatter}
          xStep={this.xStep}
          xRange={[this.sourceData.timeStart, this.sourceData.timeEnd]}
          data={this.data}
          filteredLegend={this.filteredLegend}
          hasPointer={this.hasPointer}
          legendPosition={this.legendPosition}
          showLegend={this.showLegend}
          legendWidth={this.legendWidth}
          legendHeight={this.legendHeight}
          padding={this.padding}
          onBrush={this.onBrush}
          ondblclick={this.selectDot} />
      <div class="line-brush-opt" ref="bushOpt" style={{ left: this.brushPositionX + 'px', }}>
        <a-icon type="close" class="line-brush-opt-close" onclick={this.hideBrushOpt} />
        want to:
        {
          this.brushOpts
        }
      </div>
    </div>
    )
  },
}
